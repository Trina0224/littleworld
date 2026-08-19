(() => {
  function applyBaselineLabel() {
    if (typeof game === 'undefined') {
      setTimeout(applyBaselineLabel, 80);
      return;
    }

    const scene = game.scene.getScene('Jerusalem25D');
    if (!scene || !scene.sys?.isActive()) {
      setTimeout(applyBaselineLabel, 80);
      return;
    }

    for (const child of scene.children.list) {
      if (child.type !== 'Text') continue;
      const text = String(child.text || '');
      if (text.startsWith('v0.7')) {
        child.setText('v0.10 · clean geometry baseline · art overlays disabled');
      }
    }

    const title = document.querySelector('#hud .title');
    if (title) title.textContent = 'LittleWorld — Jerusalem 2.5D v0.10';

    const status = document.getElementById('status');
    if (status) {
      status.textContent = 'Bethesda geometry baseline · 正確投影、雙池、中央隔牆與南池階梯';
    }
  }

  window.addEventListener('load', applyBaselineLabel, { once: true });
})();
