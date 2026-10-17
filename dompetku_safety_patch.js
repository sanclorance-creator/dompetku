/* DompetKu Fix 7 safety patch. Loaded after app.html's main script. */
(function () {
  'use strict';

  // Never silently discard a live wallet balance or break savings transfer history.
  window.deleteWallet = function (id) {
    if (!state || state.wallets.length <= 1) {
      showToast('Minimal harus ada 1 akun aktif');
      return;
    }
    var source = state.wallets.find(function (w) { return w.id === id; });
    if (!source) return;

    var linkedTx = state.transactions.filter(function (t) { return t.walletId === id; });
    var linkedTransfers = linkedTx.filter(function (t) { return !!t.transfer || !!t.savingId; });
    var others = state.wallets.filter(function (w) { return w.id !== id; });
    var totals = computeTotals();
    var balance = Number(totals.walletBalances[id]) || 0;
    var balanceIsZero = balance === 0;
    var canDeleteHistorySafely = balanceIsZero && linkedTransfers.length === 0;

    if (linkedTx.length === 0 && canDeleteHistorySafely) {
      confirmAction({
        title: 'Hapus akun ' + escapeHtml(source.name) + '?',
        message: 'Akun <strong>' + escapeHtml(source.name) + '</strong> tidak memiliki saldo maupun riwayat transaksi dan akan dihapus.',
        confirmLabel: 'Ya, Hapus Akun',
        onConfirm: function () {
          saveSnapshot('Hapus akun ' + source.name);
          state.wallets = state.wallets.filter(function (w) { return w.id !== id; });
          if (selectedBankFilter === id) selectedBankFilter = 'all';
          closeModal();
          saveState();
          showToast('Akun ' + source.name + ' dihapus');
        }
      });
      return;
    }

    var msg = 'Akun <strong>' + escapeHtml(source.name) + '</strong> memiliki saldo saat ini <strong>' + formatRupiah(balance) + '</strong> dan ' + linkedTx.length + ' transaksi.';
    if (linkedTransfers.length) {
      msg += ' Ada ' + linkedTransfers.length + ' transaksi transfer target dana. Riwayat transfer wajib dipindahkan agar saldo tabungan tidak menjadi tidak konsisten.';
    } else if (!balanceIsZero) {
      msg += ' Saldo bukan nol, jadi akun beserta transaksinya tidak boleh dihapus langsung. Pindahkan saldo dan riwayat ke akun lain.';
    } else {
      msg += ' Pilih untuk memindahkan riwayat, atau menghapus riwayat biasa karena saldo akun saat ini nol.';
    }

    openModal(
      '<div class="modal-header">' +
        '<span class="modal-title" style="color:var(--warning);">' + SVG_PATHS.bank + ' <span>Hapus / Pindahkan ' + escapeHtml(source.name) + '</span></span>' +
        '<button type="button" class="close-btn" onclick="closeModal()">✕</button>' +
      '</div>' +
      '<p style="font-size:13px;color:var(--text-sub);line-height:1.6;margin-bottom:10px;">' + msg + '</p>' +
      '<label class="form-label">Pindahkan ke Akun</label>' +
      '<select id="migrateTargetWallet" class="form-control">' +
        others.map(function (o) { return '<option value="' + escapeHtml(o.id) + '">' + escapeHtml(o.name) + '</option>'; }).join('') +
      '</select>' +
      '<button type="button" class="btn-submit" onclick="confirmMigrateAndDeleteWallet(\'' + String(id).replace(/'/g, '&#39;') + '\')">Pindahkan Saldo & Riwayat, lalu Hapus Akun</button>' +
      (canDeleteHistorySafely
        ? '<button type="button" class="btn-danger" onclick="confirmDeleteWalletWithTx(\'' + String(id).replace(/'/g, '&#39;') + '\')">Hapus Akun Beserta ' + linkedTx.length + ' Transaksinya</button>'
        : '<p style="font-size:12px;color:var(--text-muted);margin-top:8px;">Opsi hapus beserta riwayat dinonaktifkan karena akan membuang saldo atau memutus riwayat transfer.</p>')
    );
  };

  // A savings target with a balance or transfer history must be migrated, not deleted outright.
  window.deleteSavingGoal = function (id) {
    var source = state.savings.find(function (s) { return s.id === id; });
    if (!source) return;
    var linkedTx = state.transactions.filter(function (t) { return t.savingId === id; });
    var linkedInvestments = (state.portfolio || []).filter(function (p) { return p.goalId === id; });
    var amount = Number(source.current) || 0;
    var others = state.savings.filter(function (s) { return s.id !== id; });

    if (linkedTx.length === 0 && linkedInvestments.length === 0 && amount === 0) {
      confirmAction({
        title: 'Hapus target ' + escapeHtml(source.name) + '?',
        message: 'Target ini tidak memiliki saldo atau riwayat transfer. Target akan dihapus.',
        confirmLabel: 'Ya, Hapus Target',
        onConfirm: function () {
          saveSnapshot('Hapus target ' + source.name);
          state.savings = state.savings.filter(function (s) { return s.id !== id; });
          closeModal();
          saveState();
          showToast('Target dana dihapus');
        }
      });
      return;
    }

    if (!others.length) {
      showToast('Buat target dana lain dulu, lalu pindahkan saldo dan riwayat sebelum menghapus target ini');
      return;
    }

    var desc = 'Target <strong>' + escapeHtml(source.name) + '</strong> memiliki saldo ' +
      '<strong>' + formatRupiah(amount) + '</strong>, ' + linkedTx.length + ' transaksi transfer, dan ' +
      linkedInvestments.length + ' investasi tertaut. Pindahkan semuanya ke target lain agar tidak ada tautan yatim.';
    openModal(
      '<div class="modal-header">' +
        '<span class="modal-title" style="color:var(--warning);">' + SVG_PATHS.vault + ' <span>Pindahkan Target Dana</span></span>' +
        '<button type="button" class="close-btn" onclick="closeModal()">✕</button>' +
      '</div>' +
      '<p style="font-size:13px;color:var(--text-sub);line-height:1.6;margin-bottom:10px;">' + desc + '</p>' +
      '<label class="form-label">Pindahkan ke Target Dana</label>' +
      '<select id="migrateTargetSavings" class="form-control">' +
        others.map(function (s) { return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name) + ' (' + formatRupiah(s.current) + ')</option>'; }).join('') +
      '</select>' +
      '<button type="button" class="btn-submit" onclick="migrateAndDeleteSavingGoal(\'' + String(id).replace(/'/g, '&#39;') + '\')">Pindahkan Saldo & Riwayat, lalu Hapus Target</button>' +
      '<button type="button" class="btn-finpro-secondary" style="width:100%;margin-top:8px;" onclick="closeModal()">Batal</button>'
    );
  };

  window.migrateAndDeleteSavingGoal = function (sourceId) {
    var source = state.savings.find(function (s) { return s.id === sourceId; });
    var sel = document.getElementById('migrateTargetSavings');
    var targetId = sel ? sel.value : '';
    var target = state.savings.find(function (s) { return s.id === targetId; });
    if (!source || !target || sourceId === targetId) {
      showToast('Pilih target dana tujuan yang berbeda');
      return;
    }

    saveSnapshot('Pindahkan & hapus target ' + source.name);
    target.current = (Number(target.current) || 0) + (Number(source.current) || 0);
    state.transactions.forEach(function (t) {
      if (t.savingId === sourceId) t.savingId = targetId;
    });
    (state.portfolio || []).forEach(function (p) {
      if (p.goalId === sourceId) p.goalId = targetId;
    });
    state.savings = state.savings.filter(function (s) { return s.id !== sourceId; });
    closeModal();
    saveState();
    showToast('Saldo dan riwayat dipindahkan ke ' + target.name);
  };
})();