/* Budggt 2 integrity patch. Loaded after the existing wallet/savings migration patch. */
(function () {
  'use strict';

  function validDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return false;
    var y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
    var date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }

  // Goal balances must be reconciled through the transaction ledger, never typed in as free money.
  if (typeof window.renderSavingModal === 'function') {
    var originalRenderSavingModal = window.renderSavingModal;
    window.renderSavingModal = function () {
      originalRenderSavingModal();
      var currentInput = document.getElementById('savCurInput');
      if (!currentInput) return;
      currentInput.readOnly = true;
      currentInput.setAttribute('aria-label', 'Saldo goal saat ini. Ubah melalui Setor atau Tarik Dana.');
      currentInput.style.opacity = '0.75';
      if (!currentInput.parentNode.querySelector('.goal-balance-ledger-note')) {
        var note = document.createElement('small');
        note.className = 'goal-balance-ledger-note';
        note.style.cssText = 'display:block;font-size:10.5px;color:var(--text-muted);margin-top:4px;line-height:1.4;';
        note.textContent = 'Saldo hanya berubah lewat Setor / Tarik agar rekening dan goal tetap sinkron.';
        currentInput.insertAdjacentElement('afterend', note);
      }
    };
  }

  if (typeof window.saveSavingGoal === 'function') {
    var originalSaveSavingGoal = window.saveSavingGoal;
    window.saveSavingGoal = function () {
      var currentGoal = form.id ? state.savings.find(function (g) { return g.id === form.id; }) : null;
      var currentInput = document.getElementById('savCurInput');
      var targetInput = document.getElementById('savTarInput');
      var dateInput = document.getElementById('savDateInput');
      var targetRaw = targetInput ? targetInput.value : form.target;
      var targetValue = parseInt(String(targetRaw || '0').replace(/\D/g, ''), 10) || 0;
      var targetDate = dateInput ? dateInput.value : form.targetDate;

      if (targetValue <= 0) {
        showToast('Target nominal harus lebih dari Rp 0');
        if (targetInput) targetInput.focus();
        return;
      }
      if (!validDate(targetDate)) {
        showToast('Pilih tanggal target yang valid');
        if (dateInput) dateInput.focus();
        return;
      }

      form.current = currentGoal ? String(Number(currentGoal.current) || 0) : '0';
      if (currentInput) currentInput.value = formatThousands(form.current);
      return originalSaveSavingGoal();
    };
  }

  // Link each portfolio item to an optional savings goal; the data field is preserved by normalizeState.
  function attachPortfolioGoalSelector() {
    var valueInput = document.getElementById('portValueInput');
    if (!valueInput || document.getElementById('portGoalSelect')) return;

    var amountRow = valueInput.parentElement && valueInput.parentElement.parentElement;
    if (!amountRow || !amountRow.parentNode) return;

    var wrapper = document.createElement('div');
    wrapper.style.marginTop = '8px';

    var label = document.createElement('label');
    label.className = 'form-label';
    label.textContent = 'Tautkan ke Goal (opsional)';

    var select = document.createElement('select');
    select.id = 'portGoalSelect';
    select.className = 'form-control';

    var none = document.createElement('option');
    none.value = '';
    none.textContent = 'Tidak ditautkan';
    select.appendChild(none);

    (state.savings || []).forEach(function (goal) {
      var option = document.createElement('option');
      option.value = goal.id;
      option.textContent = goal.name;
      select.appendChild(option);
    });

    select.value = form.goalId || '';
    select.addEventListener('change', function () {
      form.goalId = select.value || '';
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    amountRow.parentNode.insertBefore(wrapper, amountRow);
  }

  if (typeof window.renderPortfolioModal === 'function') {
    var originalRenderPortfolioModal = window.renderPortfolioModal;
    window.renderPortfolioModal = function () {
      originalRenderPortfolioModal();
      attachPortfolioGoalSelector();
    };
  }

  if (typeof window.openPortfolioModal === 'function') {
    var originalOpenPortfolioModal = window.openPortfolioModal;
    window.openPortfolioModal = function (portfolioId, defaultInstrument) {
      originalOpenPortfolioModal(portfolioId, defaultInstrument);
      var item = portfolioId ? (state.portfolio || []).find(function (p) { return p.id === portfolioId; }) : null;
      form.goalId = item && item.goalId ? String(item.goalId) : '';
      var select = document.getElementById('portGoalSelect');
      if (select) select.value = form.goalId;
    };
  }

  if (typeof window.savePortfolioItem === 'function') {
    var originalSavePortfolioItem = window.savePortfolioItem;
    window.savePortfolioItem = function () {
      var priorIds = new Set((state.portfolio || []).map(function (p) { return p.id; }));
      var existingId = form.id || '';
      var goalSelect = document.getElementById('portGoalSelect');
      var goalId = goalSelect ? goalSelect.value : (form.goalId || '');
      var result = originalSavePortfolioItem();
      var item = existingId
        ? (state.portfolio || []).find(function (p) { return p.id === existingId; })
        : (state.portfolio || []).find(function (p) { return !priorIds.has(p.id); });
      if (item) {
        item.goalId = goalId && state.savings.some(function (g) { return g.id === goalId; }) ? goalId : '';
        saveState();
      }
      return result;
    };
  }

  // Show the number of linked investments on each goal card.
  if (typeof window.renderSavingsPage === 'function') {
    var originalRenderSavingsPage = window.renderSavingsPage;
    window.renderSavingsPage = function () {
      var goals = (state.savings || []).slice();
      var html = originalRenderSavingsPage();
      var index = 0;
      return html.replace(/<span>(\d+) transaksi tertaut<\/span>/g, function (match) {
        var goal = goals[index++];
        if (!goal) return match;
        var count = (state.portfolio || []).filter(function (p) { return p.goalId === goal.id; }).length;
        return match + '<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap;">' +
          '<span style="color:#A3E635;display:inline-flex;">' + SVG_PATHS.diamond + '</span>' +
          count + ' investasi tertaut</span>';
      });
    };
  }

  // Destructive record actions create a snapshot and require explicit confirmation.
  window.deleteTx = function (id) {
    var tx = state.transactions.find(function (t) { return t.id === id; });
    if (!tx) return;
    var cat = getCategory(tx.categoryId);
    confirmAction({
      title: 'Hapus transaksi ini?',
      message: 'Transaksi <strong>' + escapeHtml(tx.note || cat.name) + '</strong> sebesar <strong>' +
        formatRupiah(tx.amount) + '</strong> akan dihapus dan memengaruhi saldo serta laporan.',
      confirmLabel: 'Ya, Hapus Transaksi',
      onConfirm: function () {
        saveSnapshot('Hapus transaksi');
        state.transactions = state.transactions.filter(function (t) { return t.id !== id; });
        closeModal();
        saveState();
        showToast('Transaksi dihapus');
      }
    });
  };

  window.deleteBudget = function (id) {
    var budget = (state.budgets || []).find(function (b) { return b.id === id; });
    if (!budget) return;
    var category = getCategory(budget.categoryId);
    confirmAction({
      title: 'Hapus budget kategori?',
      message: 'Budget <strong>' + escapeHtml(category.name) + '</strong> sebesar <strong>' +
        formatRupiah(budget.limit) + '</strong> akan dihapus. Riwayat transaksi tetap aman.',
      confirmLabel: 'Ya, Hapus Budget',
      onConfirm: function () {
        saveSnapshot('Hapus budget kategori');
        state.budgets = (state.budgets || []).filter(function (b) { return b.id !== id; });
        closeModal();
        saveState();
        showToast('Budget kategori dihapus');
      }
    });
  };

  window.deletePortfolioItem = function (id) {
    var item = (state.portfolio || []).find(function (p) { return p.id === id; });
    if (!item) return;
    var linkedGoal = item.goalId && state.savings.find(function (g) { return g.id === item.goalId; });
    confirmAction({
      title: 'Hapus instrumen aset?',
      message: 'Instrumen <strong>' + escapeHtml(item.name) + '</strong> senilai <strong>' +
        formatRupiah(item.value) + '</strong> akan dihapus dari total aset' +
        (linkedGoal ? ' dan dilepas dari Goal <strong>' + escapeHtml(linkedGoal.name) + '</strong>' : '') + '.',
      confirmLabel: 'Ya, Hapus Instrumen',
      onConfirm: function () {
        saveSnapshot('Hapus instrumen portofolio');
        state.portfolio = (state.portfolio || []).filter(function (p) { return p.id !== id; });
        closeModal();
        saveState();
        showToast('Instrumen dihapus dari portofolio');
      }
    });
  };

  window.deleteLiabilityItem = function (id) {
    var item = (state.liabilities || []).find(function (l) { return l.id === id; });
    if (!item) return;
    var used = Math.max(0, Number(item.usedAmount) || 0);
    confirmAction({
      title: 'Hapus kartu / cicilan?',
      message: 'Catatan <strong>' + escapeHtml(item.name) + '</strong> dengan tagihan <strong>' +
        formatRupiah(used) + '</strong> akan dihapus dari perhitungan utang. Pastikan catatan ini memang tidak lagi diperlukan.',
      confirmLabel: 'Ya, Hapus Catatan',
      onConfirm: function () {
        saveSnapshot('Hapus kartu kredit/cicilan');
        state.liabilities = (state.liabilities || []).filter(function (l) { return l.id !== id; });
        closeModal();
        saveState();
        showToast('Kartu kredit / cicilan dihapus');
      }
    });
  };

  // Cancelling a deposit/withdrawal reverses a ledger event; protect it like other destructive actions.
  window.cancelTransfer = function (txId) {
    var tx = state.transactions.find(function (t) { return t.id === txId; });
    if (!tx) return closeModal();

    var saving = state.savings.find(function (s) { return s.id === tx.savingId; });
    var amount = Number(tx.amount) || 0;
    if (saving && tx.type === 'expense' && (Number(saving.current) || 0) < amount) {
      showToast('Saldo goal tidak cukup untuk membatalkan setoran ini');
      return;
    }

    confirmAction({
      title: 'Batalkan transfer goal?',
      message: 'Transfer sebesar <strong>' + formatRupiah(amount) +
        '</strong> akan dibatalkan. Saldo akun, saldo goal, dan laporan terkait akan diperbarui.',
      confirmLabel: 'Ya, Batalkan Transfer',
      onConfirm: function () {
        saveSnapshot('Batalkan transfer goal');
        if (saving) {
          if (tx.type === 'expense') saving.current = (Number(saving.current) || 0) - amount;
          else saving.current = (Number(saving.current) || 0) + amount;
        }
        state.transactions = state.transactions.filter(function (t) { return t.id !== txId; });
        closeModal();
        saveState();
        showToast('Transfer dibatalkan');
      }
    });
  };
})();