import { getSupabase } from '../db/client';
import { formatCurrency, formatDate } from '../utils/formatters';
import { GoalService } from './goal';
import {
  startOfMonth,
  endOfMonth,
  format,
  subMonths,
  differenceInDays,
  parseISO,
} from 'date-fns';
import PDFDocument from 'pdfkit';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Initialize S3/R2 client
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

export class ReportService {
  /**
   * Generate CSV report for a given month.
   */
  static async generateCSV(yearMonth?: string): Promise<Buffer> {
    let start: string;
    let end: string;

    if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
      const [year, month] = yearMonth.split('-').map(Number);
      const dateObj = new Date(year, month - 1, 1);
      start = format(startOfMonth(dateObj), 'yyyy-MM-dd');
      end = format(endOfMonth(dateObj), 'yyyy-MM-dd');
    } else {
      const dateObj = new Date();
      start = format(startOfMonth(dateObj), 'yyyy-MM-dd');
      end = format(endOfMonth(dateObj), 'yyyy-MM-dd');
    }

    // Fetch transactions joined with categories
    const { data: txs, error } = await getSupabase()
      .from('transactions')
      .select('*, category:categories(name)')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false });

    if (error) throw error;

    const csvRows = [
      ['Date', 'Description', 'Category', 'Type', 'Amount', 'Currency', 'Amount (Base)']
    ];

    for (const tx of txs || []) {
      let categoryName = '';
      if (tx.type === 'transfer') {
        categoryName = 'Transfer';
      } else {
        categoryName = tx.category?.name || 'Other';
      }
      csvRows.push([
        tx.date,
        tx.description || '',
        categoryName,
        tx.type,
        tx.amount.toString(),
        tx.currency,
        tx.amount_base ? tx.amount_base.toString() : ''
      ]);
    }

    const { stringify } = await import('csv-stringify/sync');
    const output = stringify(csvRows);
    return Buffer.from(output, 'utf-8');
  }

  /**
   * Generate a beautiful 4-page monthly report PDF.
   */
  static async generatePDF(yearMonth?: string): Promise<Buffer> {
    let start: string;
    let end: string;
    let periodLabel: string;
    let prevStart: string;
    let prevEnd: string;
    let prevPeriodLabel: string;

    let dateObj: Date;
    if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
      const [year, month] = yearMonth.split('-').map(Number);
      dateObj = new Date(year, month - 1, 1);
    } else {
      dateObj = new Date();
    }

    start = format(startOfMonth(dateObj), 'yyyy-MM-dd');
    end = format(endOfMonth(dateObj), 'yyyy-MM-dd');
    periodLabel = format(dateObj, 'MMMM yyyy');

    const prevMonthObj = subMonths(dateObj, 1);
    prevStart = format(startOfMonth(prevMonthObj), 'yyyy-MM-dd');
    prevEnd = format(endOfMonth(prevMonthObj), 'yyyy-MM-dd');
    prevPeriodLabel = format(prevMonthObj, 'MMMM yyyy');

    // Retrieve owner currency
    const { data: owner } = await getSupabase()
      .from('owner')
      .select('currency')
      .single();
    const ownerCurrency = owner?.currency || 'USD';

    // Retrieve transactions for period
    const { data: txs, error: txsError } = await getSupabase()
      .from('transactions')
      .select('*, category:categories(name, icon, color)')
      .gte('date', start)
      .lte('date', end);

    if (txsError) throw txsError;

    // Calculate Page 1 Summaries
    let income = 0;
    let expense = 0;
    const categoryMap: Record<string, { name: string; icon: string; color: string; total: number }> = {};

    for (const tx of txs || []) {
      const amtBase = Number(tx.amount_base || tx.amount);
      if (tx.type === 'income') {
        income += amtBase;
      } else if (tx.type === 'expense') {
        expense += amtBase;
        if (tx.category_id) {
          const catName = tx.category?.name || 'Other';
          const catIcon = tx.category?.icon || '❓';
          const catColor = tx.category?.color || '#64748b';
          if (!categoryMap[tx.category_id]) {
            categoryMap[tx.category_id] = { name: catName, icon: catIcon, color: catColor, total: 0 };
          }
          categoryMap[tx.category_id].total += amtBase;
        }
      }
    }

    const net = income - expense;

    // Fetch prior month expenses to compare
    const { data: prevTxs, error: prevTxsError } = await getSupabase()
      .from('transactions')
      .select('amount_base, amount')
      .eq('type', 'expense')
      .gte('date', prevStart)
      .lte('date', prevEnd);

    if (prevTxsError) throw prevTxsError;

    let priorExpense = 0;
    for (const tx of prevTxs || []) {
      priorExpense += Number(tx.amount_base || tx.amount);
    }

    // Fetch budget statuses for historical period
    // We compute this since the default database view budget_status only uses CURRENT_DATE.
    const { data: budgets, error: budgetError } = await getSupabase()
      .from('budgets')
      .select('id, category_id, amount, period, category:categories(name, icon)');

    if (budgetError) throw budgetError;

    const budgetStatusList = (budgets || []).map((b: any) => {
      const budgetAmount = Number(b.amount);
      const catId = b.category_id;
      // Filter transactions for this category in current month
      const spent = (txs || [])
        .filter(t => t.category_id === catId && t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount_base || t.amount), 0);
      const pct_used = budgetAmount > 0 ? Math.round((spent / budgetAmount) * 100) : 0;
      return {
        id: b.id,
        category_id: catId,
        category_name: b.category?.name || 'Other',
        icon: b.category?.icon || '❓',
        budget_amount: budgetAmount,
        period: b.period,
        spent,
        pct_used,
      };
    }).sort((a, b) => b.pct_used - a.pct_used);

    // Fetch savings goals
    const savingsGoalsList = await GoalService.list();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Color Palette constants
      const primaryColor = '#1e293b'; // slate 800
      const accentColor = '#0f766e';  // teal 700
      const incomeColor = '#10b981';  // emerald 500
      const expenseColor = '#ef4444'; // red 500
      const neutralDark = '#334155';  // slate 700
      const neutralLight = '#f8fafc'; // slate 50
      const dividerColor = '#e2e8f0'; // slate 200
      const secondaryText = '#64748b'; // slate 500

      // Helper to draw clean header
      const drawHeader = (pageTitle: string) => {
        doc.rect(0, 0, doc.page.width, 15).fill(accentColor);
        doc.font('Helvetica-Bold').fontSize(22).fillColor(primaryColor).text(pageTitle, 50, 45);
        doc.font('Helvetica').fontSize(11).fillColor(secondaryText).text(periodLabel, 50, 72);
        doc.strokeColor(dividerColor).lineWidth(1).moveTo(50, 90).lineTo(doc.page.width - 50, 90).stroke();
      };

      // ─── PAGE 1: Monthly Summary ───────────────────────────────────────────
      drawHeader('Monthly Financial Digest');

      // Draw Summary Cards
      const cardY = 120;
      const cardWidth = 145;
      const cardHeight = 85;
      const gap = 30;

      const drawCard = (x: number, label: string, amountStr: string, amountCol: string, bgCol: string, borderCol: string) => {
        doc.roundedRect(x, cardY, cardWidth, cardHeight, 6)
           .fillAndStroke(bgCol, borderCol);
        
        doc.fillColor(secondaryText).font('Helvetica-Bold').fontSize(9)
           .text(label, x + 15, cardY + 18, { width: cardWidth - 30 });
           
        doc.fillColor(amountCol).font('Helvetica-Bold').fontSize(14)
           .text(amountStr, x + 15, cardY + 40, { width: cardWidth - 30 });
      };

      // Card 1: Income
      drawCard(50, 'TOTAL INCOME', `+${formatCurrency(income, ownerCurrency)}`, incomeColor, '#f0fdf4', '#bbf7d0');
      // Card 2: Expenses
      drawCard(50 + cardWidth + gap, 'TOTAL EXPENSES', `-${formatCurrency(expense, ownerCurrency)}`, expenseColor, '#fef2f2', '#fecaca');
      // Card 3: Net Savings
      const netColor = net >= 0 ? incomeColor : expenseColor;
      const netBg = net >= 0 ? '#ecfdf5' : '#fff5f5';
      const netBorder = net >= 0 ? '#a7f3d0' : '#feb2b2';
      const netSign = net >= 0 ? '+' : '';
      drawCard(50 + 2 * (cardWidth + gap), 'NET SAVINGS', `${netSign}${formatCurrency(net, ownerCurrency)}`, netColor, netBg, netBorder);

      // Prior Month Comparison
      doc.roundedRect(50, 240, 495, 75, 6)
         .fillAndStroke(neutralLight, dividerColor);

      doc.font('Helvetica-Bold').fontSize(12).fillColor(primaryColor)
         .text('Prior Month Comparison', 65, 255);

      let compText = '';
      let compColor = secondaryText;
      if (priorExpense > 0) {
        const changePct = ((expense - priorExpense) / priorExpense) * 100;
        const changeStr = `${Math.round(Math.abs(changePct))}%`;
        const dir = changePct >= 0 ? 'increased' : 'decreased';
        compColor = changePct > 0 ? expenseColor : incomeColor;
        compText = `Your monthly spending has ${dir} by ${changeStr} compared to ${prevPeriodLabel}.\n` +
                   `Last month's total: ${formatCurrency(priorExpense, ownerCurrency)}  •  This month's total: ${formatCurrency(expense, ownerCurrency)}`;
      } else {
        compText = `No historical data found for ${prevPeriodLabel} to draw a comparison. Keep logging transactions to unlock trends!`;
      }

      doc.font('Helvetica').fontSize(10).fillColor(compColor)
         .text(compText, 65, 275, { width: 465, lineGap: 3 });

      // Overview message / instructions
      doc.font('Helvetica').fontSize(10).fillColor(neutralDark)
         .text(
           'This document provides a secure, consolidated summary of your financial transactions during the selected month.\n\n' +
           'Use these details to monitor spending behaviors, verify category limits, and track savings achievements. ' +
           'All conversions are based on live exchange rates recorded at transaction time.',
           50, 360, { width: 495, lineGap: 4 }
         );

      // ─── PAGE 2: Category Breakdown ────────────────────────────────────────
      doc.addPage();
      drawHeader('Category Breakdown');

      const categoriesData = Object.values(categoryMap)
        .sort((a, b) => b.total - a.total);

      if (categoriesData.length > 0) {
        let currentY = 120;
        
        // Table Headers
        doc.font('Helvetica-Bold').fontSize(10).fillColor(secondaryText);
        doc.text('CATEGORY', 50, currentY);
        doc.text('DISTRIBUTION & VISUAL PROGRESS', 200, currentY);
        doc.text('AMOUNT', 380, currentY, { width: 110, align: 'right' });
        
        currentY += 15;
        doc.strokeColor(dividerColor).lineWidth(1).moveTo(50, currentY).lineTo(doc.page.width - 50, currentY).stroke();
        currentY += 15;

        for (const cat of categoriesData) {
          const pct = expense > 0 ? (cat.total / expense) * 100 : 0;

          // 1. Draw Category name & icon
          doc.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor)
             .text(`${cat.icon} ${cat.name}`, 50, currentY, { width: 140 });
             
          // 2. Draw Progress Bar background
          const barX = 200;
          const barY = currentY + 2;
          const barWidth = 140;
          const barHeight = 8;
          
          doc.roundedRect(barX, barY, barWidth, barHeight, 4)
             .fill('#e2e8f0');
             
          // 3. Draw Filled Progress Bar
          const filledWidth = (pct / 100) * barWidth;
          if (filledWidth > 0) {
            doc.roundedRect(barX, barY, filledWidth, barHeight, 4)
               .fill(cat.color || accentColor);
          }
          
          // 4. Draw Percentage
          doc.font('Helvetica').fontSize(9).fillColor(secondaryText)
             .text(`${Math.round(pct)}%`, barX + barWidth + 8, currentY + 1);

          // 5. Draw Amount
          doc.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor)
             .text(formatCurrency(cat.total, ownerCurrency), 380, currentY, { width: 110, align: 'right' });
             
          currentY += 24;
          doc.strokeColor('#f8fafc').lineWidth(1).moveTo(50, currentY).lineTo(doc.page.width - 50, currentY).stroke();
          currentY += 10;

          // Page boundary check
          if (currentY > doc.page.height - 80) {
            doc.addPage();
            drawHeader('Category Breakdown (Cont.)');
            currentY = 120;
          }
        }
      } else {
        doc.font('Helvetica-Oblique').fontSize(11).fillColor(secondaryText)
           .text('No expense transactions recorded in this period.', 50, 150, { align: 'center' });
      }

      // ─── PAGE 3: Budget Status Table ───────────────────────────────────────
      doc.addPage();
      drawHeader('Budget Status');

      if (budgetStatusList.length > 0) {
        let currentY = 120;

        // Table Headers
        doc.font('Helvetica-Bold').fontSize(10).fillColor(secondaryText);
        doc.text('CATEGORY / BUDGET', 50, currentY);
        doc.text('UTILISATION PROGRESS BAR', 200, currentY);
        doc.text('SPENT / LIMIT', 350, currentY, { width: 145, align: 'right' });

        currentY += 15;
        doc.strokeColor(dividerColor).lineWidth(1).moveTo(50, currentY).lineTo(doc.page.width - 50, currentY).stroke();
        currentY += 15;

        for (const b of budgetStatusList) {
          doc.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor)
             .text(`${b.icon} ${b.category_name}`, 50, currentY, { width: 140 });

          const barX = 200;
          const barY = currentY + 2;
          const barWidth = 120;
          const barHeight = 8;

          doc.roundedRect(barX, barY, barWidth, barHeight, 4)
             .fill('#e2e8f0');

          const filledWidth = Math.min(barWidth, (b.pct_used / 100) * barWidth);
          const barColor = b.pct_used >= 100 ? expenseColor : b.pct_used >= 80 ? '#f59e0b' : incomeColor;

          if (filledWidth > 0) {
            doc.roundedRect(barX, barY, filledWidth, barHeight, 4)
               .fill(barColor);
          }

          // Indicator icon
          const indicator = b.pct_used >= 100 ? '🔴' : b.pct_used >= 80 ? '⚠️' : '✅';
          doc.font('Helvetica').fontSize(9).fillColor(secondaryText)
             .text(`${indicator} ${Math.round(b.pct_used)}%`, barX + barWidth + 8, currentY + 1);

          const usageStr = `${formatCurrency(b.spent, ownerCurrency)} / ${formatCurrency(b.budget_amount, ownerCurrency)}`;
          doc.font('Helvetica-Bold').fontSize(11).fillColor(neutralDark)
             .text(usageStr, 350, currentY, { width: 145, align: 'right' });

          currentY += 24;
          doc.strokeColor('#f8fafc').lineWidth(1).moveTo(50, currentY).lineTo(doc.page.width - 50, currentY).stroke();
          currentY += 10;

          if (currentY > doc.page.height - 80) {
            doc.addPage();
            drawHeader('Budget Status (Cont.)');
            currentY = 120;
          }
        }
      } else {
        doc.font('Helvetica-Oblique').fontSize(11).fillColor(secondaryText)
           .text('No monthly budgets configured. Use /budget set to configure your limits.', 50, 150, { align: 'center' });
      }

      // ─── PAGE 4: Savings Goals Progress ────────────────────────────────────
      doc.addPage();
      drawHeader('Savings Goals Progress');

      if (savingsGoalsList.length > 0) {
        let currentY = 120;

        for (const goal of savingsGoalsList) {
          const targetAmt = Number(goal.target_amount);
          const currentAmt = Number(goal.current_amount);
          const pct = targetAmt > 0 ? (currentAmt / targetAmt) * 100 : 0;
          
          let statusColor = '#3b82f6'; // active - blue
          if (goal.status === 'completed') statusColor = incomeColor;
          if (goal.status === 'paused') statusColor = secondaryText;

          doc.font('Helvetica-Bold').fontSize(12).fillColor(primaryColor)
             .text(goal.name, 50, currentY, { width: 230 });

          // Status Badge
          doc.font('Helvetica-Bold').fontSize(9).fillColor(statusColor)
             .text(goal.status.toUpperCase(), 300, currentY + 1, { width: 70 });

          const progressText = `${formatCurrency(currentAmt, ownerCurrency)} of ${formatCurrency(targetAmt, ownerCurrency)}`;
          doc.font('Helvetica-Bold').fontSize(11).fillColor(neutralDark)
             .text(progressText, 380, currentY, { width: 110, align: 'right' });

          // Progress Bar
          currentY += 18;
          const barWidth = 445;
          doc.roundedRect(50, currentY, barWidth, 8, 4)
             .fill('#e2e8f0');

          const filledWidth = Math.min(barWidth, (pct / 100) * barWidth);
          if (filledWidth > 0) {
            doc.roundedRect(50, currentY, filledWidth, 8, 4)
               .fill(statusColor);
          }

          // Deadline and details
          currentY += 15;
          let deadlineStr = 'No target date set';
          if (goal.deadline) {
            const daysLeft = differenceInDays(parseISO(goal.deadline), new Date());
            const daysText = daysLeft >= 0 ? `${daysLeft} days left` : `${Math.abs(daysLeft)} days overdue`;
            deadlineStr = `Target Date: ${formatDate(goal.deadline)} (${daysText})`;
          }

          doc.font('Helvetica').fontSize(9).fillColor(secondaryText)
             .text(`${deadlineStr}  •  ${Math.round(pct)}% achieved`, 50, currentY);

          currentY += 25;
          doc.strokeColor(dividerColor).lineWidth(0.5).moveTo(50, currentY).lineTo(doc.page.width - 50, currentY).stroke();
          currentY += 15;

          if (currentY > doc.page.height - 80) {
            doc.addPage();
            drawHeader('Savings Goals Progress (Cont.)');
            currentY = 120;
          }
        }
      } else {
        doc.font('Helvetica-Oblique').fontSize(11).fillColor(secondaryText)
           .text('No active savings goals found. Use /goal set to configure goals.', 50, 150, { align: 'center' });
      }

      // Add footers on all pages at the end of PDF generation
      const pages = doc.bufferedPageRange();
      const generatedDateStr = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
      
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.strokeColor(dividerColor).lineWidth(0.5)
           .moveTo(50, doc.page.height - 40)
           .lineTo(doc.page.width - 50, doc.page.height - 40)
           .stroke();
           
        doc.fontSize(8).fillColor(secondaryText)
           .text(`Generated by FinanceBot — ${generatedDateStr}`, 50, doc.page.height - 30, { align: 'center' });
      }

      doc.end();
    });
  }

  /**
   * Upload report Buffer to Cloudflare R2 and return a 24-hour presigned URL.
   */
  static async uploadToR2(filename: string, content: Buffer, contentType: string): Promise<string> {
    const bucketName = process.env.R2_BUCKET_NAME || 'financebot-exports';

    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: filename,
      Body: content,
      ContentType: contentType,
    }));

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: filename,
    });

    // 24 hours = 86400 seconds
    const url = await getSignedUrl(s3Client, command, { expiresIn: 86400 });
    return url;
  }
}
