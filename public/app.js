document.addEventListener('DOMContentLoaded', () => {
  // ─── STATE MANAGEMENT ─────────────────────────────────────────────────────
  let currentMode = 'demo'; // 'demo' or 'live'
  let dashboardPasscode = sessionStorage.getItem('dashboard_passcode') || '';
  let activeStats = null;
  let activeCurrency = 'USD';

  // ─── DOM ELEMENTS ─────────────────────────────────────────────────────────
  const mobileNavToggle = document.getElementById('mobileNavToggle');
  const navLinks = document.querySelector('.nav-links');
  
  // Interactive Project toggle elements
  const projectCardFinanceBot = document.getElementById('projectCardFinanceBot');
  const financeBotDetailPortal = document.getElementById('financeBotDetailPortal');

  // Chat elements
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');
  const clearChatBtn = document.getElementById('clearChatBtn');

  // Dashboard Mode elements
  const modeToggle = document.getElementById('dashboardModeToggle');
  const demoLabel = document.getElementById('demoModeLabel');
  const liveLabel = document.getElementById('liveModeLabel');
  const statusBadge = document.getElementById('dashboardStatusBadge');
  const passcodeContainer = document.getElementById('passcodeContainer');
  const passcodeForm = document.getElementById('passcodeForm');
  const passcodeField = document.getElementById('dashboardPasscode');
  const passcodeError = document.getElementById('passcodeError');
  const dashboardGrid = document.getElementById('dashboardGrid');

  // Dashboard Metric elements
  const netWorthEl = document.getElementById('netWorthValue');
  const incomeEl = document.getElementById('incomeValue');
  const expenseEl = document.getElementById('expenseValue');
  const savingsEl = document.getElementById('savingsValue');

  // Dashboard List panels
  const walletsList = document.getElementById('walletsList');
  const budgetsList = document.getElementById('budgetsList');
  const goalsList = document.getElementById('goalsList');
  const transactionsList = document.getElementById('transactionsList');

  // ─── NAVIGATION LOGIC ─────────────────────────────────────────────────────
  
  // Scroll spy for active nav link
  const sections = document.querySelectorAll('section');
  const navItems = document.querySelectorAll('.nav-links a');

  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      if (pageYOffset >= (sectionTop - 220)) {
        current = section.getAttribute('id');
      }
    });

    navItems.forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('href') === `#${current}`) {
        item.classList.add('active');
      }
    });
  });

  // Mobile menu toggle
  if (mobileNavToggle) {
    mobileNavToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      const icon = mobileNavToggle.querySelector('i');
      if (navLinks.classList.contains('active')) {
        icon.className = 'fa-solid fa-xmark';
      } else {
        icon.className = 'fa-solid fa-bars';
      }
    });
  }

  // Close mobile nav on click
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navLinks.classList.remove('active');
      const icon = mobileNavToggle?.querySelector('i');
      if (icon) icon.className = 'fa-solid fa-bars';
    });
  });

  // ─── INTERACTIVE PROJECT SELECTION ────────────────────────────────────────

  // Expand FinanceBot Workspace
  if (projectCardFinanceBot) {
    projectCardFinanceBot.addEventListener('click', (e) => {
      // If user clicked inside contact buttons, let link propagate
      if (e.target.tagName === 'A' || e.target.closest('a')) return;

      const isPortalVisible = window.getComputedStyle(financeBotDetailPortal).display !== 'none';

      if (isPortalVisible) {
        // Hide
        financeBotDetailPortal.style.display = 'none';
        projectCardFinanceBot.classList.remove('active-project');
      } else {
        // Show and scroll to it
        financeBotDetailPortal.style.display = 'block';
        projectCardFinanceBot.classList.add('active-project');
        
        // Fetch dashboard stats on display
        fetchDashboardData();
        
        setTimeout(() => {
          financeBotDetailPortal.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    });
  }

  // Show FinanceBot details by default
  if (financeBotDetailPortal) {
    financeBotDetailPortal.style.display = 'block';
  }

  // ─── CHAT SIMULATOR LOGIC ─────────────────────────────────────────────────

  // Clear chat window
  clearChatBtn.addEventListener('click', () => {
    chatMessages.innerHTML = `
      <div class="message bot">
        <div class="chat-avatar">🤖</div>
        <div class="msg-bubble">
          Halo! Chat history dibersihkan. Ketik sesuatu untuk mencatat transaksi baru.
          <div class="example-suggestions">
            <span class="suggestion-tag">gaji 6000000 masuk ke Bank</span>
            <span class="suggestion-tag">spent 50k on lunch</span>
            <span class="suggestion-tag">transfer 200 from Bank to Cash</span>
            <span class="suggestion-tag">bayar kosan 1.5 juta kemarin</span>
          </div>
        </div>
      </div>
    `;
    bindSuggestions();
  });

  // Typing suggestions
  function bindSuggestions() {
    document.querySelectorAll('.suggestion-tag').forEach(tag => {
      tag.addEventListener('click', (e) => {
        e.stopPropagation(); // Stop trigger card selection
        chatInput.value = tag.innerText;
        chatInput.focus();
      });
    });
  }
  bindSuggestions();

  // Send message to demo chat NLP API
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    // Add user message to UI
    appendMessage('user', text);
    chatInput.value = '';
    chatInput.focus();

    // Show bot typing indicator
    const typingIndicator = appendMessage('bot', '<div class="dot-typing"></div> Thinking...');

    try {
      const response = await fetch('/api/chat-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      const data = await response.json();
      typingIndicator.remove();

      if (!response.ok) {
        throw new Error(data.error || 'Server error');
      }

      appendMessage('bot', data.message);
    } catch (err) {
      typingIndicator.remove();
      appendMessage('bot', `⚠️ Gagal menghubungi server: ${err.message}. Pastikan koneksi server menyala.`);
    }
  });

  function appendMessage(sender, htmlContent) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;

    if (sender === 'bot') {
      msgDiv.innerHTML = `
        <div class="chat-avatar">🤖</div>
        <div class="msg-bubble">${htmlContent}</div>
      `;
    } else {
      msgDiv.innerHTML = `
        <div class="msg-bubble">${htmlContent}</div>
      `;
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgDiv;
  }

  // ─── DASHBOARD PORTAL LOGIC ───────────────────────────────────────────────

  // Mode Toggle click handler
  modeToggle.addEventListener('change', () => {
    if (modeToggle.checked) {
      // Switched to LIVE
      currentMode = 'live';
      demoLabel.classList.remove('active');
      liveLabel.classList.add('active');

      if (!dashboardPasscode) {
        // Prompt passcode
        showPasscodePrompt();
      } else {
        // Fetch live stats
        fetchDashboardData();
      }
    } else {
      // Switched to DEMO
      currentMode = 'demo';
      demoLabel.classList.add('active');
      liveLabel.classList.remove('active');
      passcodeContainer.classList.add('hidden');
      dashboardGrid.classList.remove('blur-effect');
      
      statusBadge.className = 'status-indicator demo';
      statusBadge.innerHTML = '<i class="fa-solid fa-eye"></i> Viewing Demo Data';
      
      fetchDashboardData();
    }
  });

  // Passcode verification submission
  passcodeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const inputPasscode = passcodeField.value.trim();
    if (!inputPasscode) return;

    dashboardPasscode = inputPasscode;
    sessionStorage.setItem('dashboard_passcode', dashboardPasscode);
    passcodeField.value = '';
    
    fetchDashboardData();
  });

  function showPasscodePrompt() {
    dashboardGrid.classList.add('blur-effect');
    passcodeContainer.classList.remove('hidden');
    passcodeError.classList.add('hidden');
    passcodeField.focus();
  }

  function hidePasscodePrompt() {
    passcodeContainer.classList.add('hidden');
    dashboardGrid.classList.remove('blur-effect');
  }

  // Fetch data from backend
  async function fetchDashboardData() {
    try {
      const headers = {};
      if (currentMode === 'live' && dashboardPasscode) {
        headers['X-Dashboard-Passcode'] = dashboardPasscode;
      }

      const response = await fetch('/api/dashboard-stats', { headers });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 403 || data.error) {
          // If live mode gets unauthorized error, show passcode input
          if (currentMode === 'live') {
            sessionStorage.removeItem('dashboard_passcode');
            dashboardPasscode = '';
            showPasscodePrompt();
            passcodeError.innerText = data.error || 'Incorrect passcode. Try again.';
            passcodeError.classList.remove('hidden');
            return;
          }
        }
        throw new Error(data.error || 'Failed to fetch dashboard data');
      }

      // Successful fetch
      activeStats = data.stats;
      activeCurrency = data.currency || 'USD';

      if (currentMode === 'live') {
        hidePasscodePrompt();
        statusBadge.className = 'status-indicator live';
        statusBadge.innerHTML = '<i class="fa-solid fa-signal"></i> Connected to Live Database';
      }

      renderDashboard();
    } catch (err) {
      console.error(err);
      if (currentMode === 'live') {
        sessionStorage.removeItem('dashboard_passcode');
        dashboardPasscode = '';
        showPasscodePrompt();
        passcodeError.innerText = `Error: ${err.message}`;
        passcodeError.classList.remove('hidden');
      }
    }
  }

  // ─── DASHBOARD RENDERING ──────────────────────────────────────────────────

  function formatCurrency(amount) {
    let fmt = activeCurrency;
    if (fmt === 'IDR') {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    } else if (fmt === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    }
    return `${fmt} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }

  function renderDashboard() {
    if (!activeStats) return;

    // Render Metrics
    netWorthEl.innerText = formatCurrency(activeStats.netWorth);
    incomeEl.innerText = `+${formatCurrency(activeStats.monthlyIncome)}`;
    expenseEl.innerText = `-${formatCurrency(activeStats.monthlyExpense)}`;
    
    const netSavings = activeStats.netSavings;
    savingsEl.innerText = netSavings >= 0 ? `+${formatCurrency(netSavings)}` : `-${formatCurrency(Math.abs(netSavings))}`;
    if (netSavings < 0) {
      savingsEl.className = 'metric-value text-red';
    } else {
      savingsEl.className = 'metric-value text-purple';
    }

    // 1. Render Wallets list
    walletsList.innerHTML = '';
    if (activeStats.wallets && activeStats.wallets.length > 0) {
      activeStats.wallets.forEach(w => {
        const div = document.createElement('div');
        div.className = 'wallet-row';
        div.innerHTML = `
          <div class="wallet-meta">
            <span class="wallet-avatar">${w.icon || '💳'}</span>
            <div>
              <div class="wallet-name">${w.name}</div>
              <div class="wallet-type">${w.type || 'wallet'}</div>
            </div>
          </div>
          <span class="wallet-balance">${new Intl.NumberFormat(undefined, { style: 'currency', currency: w.currency }).format(w.balance)}</span>
        `;
        walletsList.appendChild(div);
      });
    } else {
      walletsList.innerHTML = '<div class="no-data"><p>No wallets created yet.</p></div>';
    }

    // 2. Render Budgets progress
    budgetsList.innerHTML = '';
    if (activeStats.budgets && activeStats.budgets.length > 0) {
      activeStats.budgets.forEach(b => {
        const pct = b.pct_used || 0;
        let progressColorClass = 'safe';
        if (pct >= 100) progressColorClass = 'danger';
        else if (pct >= 80) progressColorClass = 'warning';

        const div = document.createElement('div');
        div.className = 'budget-row';
        div.innerHTML = `
          <div class="budget-info">
            <div class="budget-category">${b.icon || '💰'} ${b.category_name}</div>
            <div class="budget-amounts">${formatCurrency(b.spent)} / ${formatCurrency(b.budget_amount)}</div>
          </div>
          <div class="budget-progress-container">
            <div class="budget-progress-bar ${progressColorClass}" style="width: ${Math.min(pct, 100)}%"></div>
          </div>
          <div style="font-size: 0.7rem; text-align: right; color: var(--text-muted); margin-top: 2px;">
            ${pct}% used
          </div>
        `;
        budgetsList.appendChild(div);
      });
    } else {
      budgetsList.innerHTML = '<div class="no-data"><p>No budgets set yet.</p></div>';
    }

    // 3. Render Savings Goals
    goalsList.innerHTML = '';
    if (activeStats.savingsGoals && activeStats.savingsGoals.length > 0) {
      activeStats.savingsGoals.forEach(g => {
        const target = Number(g.target_amount);
        const current = Number(g.current_amount);
        const pct = target > 0 ? Math.round((current / target) * 100) : 0;
        const deadline = g.deadline ? new Date(g.deadline).toLocaleDateString() : 'No deadline';

        const div = document.createElement('div');
        div.className = 'goal-row';
        div.innerHTML = `
          <div class="goal-info">
            <div class="goal-title"><i class="fa-solid fa-bullseye" style="color: var(--primary);"></i> ${g.name}</div>
            <div class="goal-amounts">${formatCurrency(current)} / ${formatCurrency(target)}</div>
          </div>
          <div class="budget-progress-container">
            <div class="budget-progress-bar goal-progress-bar" style="width: ${Math.min(pct, 100)}%"></div>
          </div>
          <div class="goal-info" style="margin-top: 4px; font-size: 0.75rem; color: var(--text-muted);">
            <span>${pct}% completed</span>
            <span><i class="fa-solid fa-calendar-days"></i> ${deadline}</span>
          </div>
        `;
        goalsList.appendChild(div);
      });
    } else {
      goalsList.innerHTML = '<div class="no-data"><p>No savings goals set yet.</p></div>';
    }

    // 4. Render Transactions list
    transactionsList.innerHTML = '';
    if (activeStats.transactions && activeStats.transactions.length > 0) {
      activeStats.transactions.forEach(t => {
        const isIncome = t.type === 'income';
        const sign = isIncome ? '+' : '-';
        const amountClass = isIncome ? 'text-green' : 'text-red';
        const formattedDate = new Date(t.date).toLocaleDateString();

        const categoryName = t.category?.name || 'General';
        const categoryIcon = t.category?.icon || '💸';

        const div = document.createElement('div');
        div.className = 'transaction-row';
        div.innerHTML = `
          <div class="txn-meta">
            <div class="txn-category-icon">${categoryIcon}</div>
            <div>
              <div class="txn-name">${t.description || categoryName}</div>
              <div class="txn-date">${formattedDate}</div>
            </div>
          </div>
          <span class="txn-amount ${amountClass}">${sign}${new Intl.NumberFormat(undefined, { style: 'currency', currency: t.currency }).format(t.amount)}</span>
        `;
        transactionsList.appendChild(div);
      });
    } else {
      transactionsList.innerHTML = '<div class="no-data"><p>No transactions logged yet.</p></div>';
    }
  }

  // Initialize on load
  fetchDashboardData();
});
