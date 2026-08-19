(() => {
  function apply() {
    if (typeof game === 'undefined') {
      setTimeout(apply, 80);
      return;
    }
    const scene = game.scene.getScene('Jerusalem25D');
    if (!scene || !scene.sys?.isActive()) {
      setTimeout(apply, 80);
      return;
    }

    let artReady = false;
    for (const child of scene.children.list) {
      if (child.type !== 'Text') continue;
      const text = String(child.text || '');
      if (text.startsWith('v0.7')) {
        child.setText('v0.8 · Bethesda Art Pass 02 · 獨立 SVG 素材 + Phaser shadows');
      } else if (text === '畢士大池') {
        child.setVisible(false);
      } else if (text.includes('Art Pass 02')) {
        artReady = true;
      }
    }

    if (!artReady) setTimeout(apply, 120);
  }

  window.addEventListener('load', apply, { once: true });
})();
