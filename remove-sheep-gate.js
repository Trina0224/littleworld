(() => {
  const removeSheepGate = () => {
    const scene = game?.scene?.getScene?.('JerusalemGraybox');
    if (!scene || !scene.sys?.isActive()) {
      requestAnimationFrame(removeSheepGate);
      return;
    }

    // Remove the uncertain Sheep Gate label from the graybox.
    scene.children.list
      .filter((child) => child?.type === 'Text' && child.text === '羊門附近')
      .forEach((child) => child.destroy());

    // Cover the old schematic marker at (2500, 910). It sits on plain graybox ground.
    // This patch is temporary until the next map-source cleanup pass.
    scene.add.rectangle(2542, 901, 110, 90, 0xb5aa88, 1).setDepth(50);
  };

  requestAnimationFrame(removeSheepGate);
})();
