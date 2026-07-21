const PLAYER_WIDGET_COMPOSITION_ID = "prefab-player-widget-mc";
const POINT_POPUP_CONTAINER_ID = "point-popup-container";
const POINT_POPUP_CONTAINER_INSTANCE_LABEL = "pointPopupContainer";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function pointPopupContainerComponent() {
  return {
    id: POINT_POPUP_CONTAINER_ID,
    name: "Point Popup Container",
    kind: "container",
    instanceLabel: POINT_POPUP_CONTAINER_INSTANCE_LABEL,
    x: 150,
    y: 180,
    width: 154,
    height: 64,
    scale: 1,
    rotation: 0,
    opacity: 1,
    brightness: 1,
    visible: true,
    locked: false,
    editorHidden: false,
    transformOrigin: "center",
    defaultAnimationState: "",
    childDistribution: "none",
    shapeStyle: "rectangle",
    fillColor: "transparent",
    fillCss: "",
    borderColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    children: []
  };
}

function hasPointPopupContainer(composition) {
  return Array.isArray(composition?.components)
    && composition.components.some((component) => (
      component?.instanceLabel === POINT_POPUP_CONTAINER_INSTANCE_LABEL
      || component?.id === POINT_POPUP_CONTAINER_ID
      || hasPointPopupContainer({ components: component?.children })
    ));
}

function migratePlayerWidgetPointPopupAnchorComponents(compositionId, components = []) {
  if (compositionId !== PLAYER_WIDGET_COMPOSITION_ID || !Array.isArray(components)) return components;
  if (!hasPointPopupContainer({ components })) {
    components.push(pointPopupContainerComponent());
  }
  return components;
}

function playerWidgetPointPopupAnchorOverride(defaultComposition, manifestCompositions = {}) {
  if (defaultComposition?.id !== PLAYER_WIDGET_COMPOSITION_ID) return null;
  const saved = manifestCompositions?.[PLAYER_WIDGET_COMPOSITION_ID];
  if (!saved) return null;
  if (hasPointPopupContainer(saved)) return saved;
  return {
    ...saved,
    components: [
      ...cloneJson(Array.isArray(saved.components) ? saved.components : []),
      pointPopupContainerComponent()
    ]
  };
}

module.exports = {
  POINT_POPUP_CONTAINER_ID,
  POINT_POPUP_CONTAINER_INSTANCE_LABEL,
  hasPointPopupContainer,
  migratePlayerWidgetPointPopupAnchorComponents,
  playerWidgetPointPopupAnchorOverride,
  pointPopupContainerComponent
};
