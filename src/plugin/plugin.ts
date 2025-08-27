/// <reference types="@figma/plugin-typings" />
import html from "../../dist/index.html?raw";

figma.showUI(html, { width: 420, height: 640 });

type VariableMode = { modeId: string; name: string };

figma.on("run", () => { /* no-op */ });

figma.ui.onmessage = async (msg: any) => {
  try {
    // --- OPEN URL from UI ---
    if (msg?.type === "open-url" && typeof msg.url === "string") {
      try {
        // Support older @figma/plugin-typings
        (figma as any).openURL
          ? (figma as any).openURL(msg.url)
          : figma.ui.postMessage({ type: "open-url-fallback", url: msg.url });
      } catch {
        figma.ui.postMessage({ type: "open-url-fallback", url: msg.url });
      }
      return;
    }

    // --- Existing messages ---
    if (!msg || (msg.type !== "ui-ready" && msg.type !== "get-styles")) return;
    await sendStylesToUI();
  } catch (err) {
    console.error("Failed to collect/send styles:", err);
    figma.notify("Failed to collect styles. See console for details.");
  }
};

async function sendStylesToUI() {
  const [
    textStyles,
    paintStyles,
    effectStyles,
    variables,
    collections,
  ] = await Promise.all([
    (figma as any).getLocalTextStylesAsync() as Promise<TextStyle[]>,
    (figma as any).getLocalPaintStylesAsync() as Promise<PaintStyle[]>,
    (figma as any).getLocalEffectStylesAsync() as Promise<EffectStyle[]>,
    (figma.variables as any).getLocalVariablesAsync() as Promise<Variable[]>,
    (figma.variables as any).getLocalVariableCollectionsAsync() as Promise<VariableCollection[]>,
  ]);

  const modes: VariableMode[] = collections.flatMap((col: VariableCollection) =>
    col.modes.map((m) => ({ modeId: m.modeId, name: m.name }))
  );

  const varsForUi = variables.map((v: Variable) => ({
    id: (v as any).id as string | undefined,
    name: v.name,
    resolvedType: v.resolvedType,
    valuesByMode: v.valuesByMode,
    variableCollectionId: (v as any).variableCollectionId as string | undefined,
  }));

  const collectionsForUi = collections.map((c: VariableCollection) => ({
    id: (c as any).id as string,
    name: c.name,
    modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
  }));

  figma.ui.postMessage({
    type: "styles-data",
    payload: {
      textStyles: textStyles.map((s: TextStyle) => ({
        name: s.name,
        fontName: s.fontName,
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        paragraphSpacing: s.paragraphSpacing,
        textCase: s.textCase,
        textDecoration: s.textDecoration,
      })),
      paintStyles: paintStyles.map((s: PaintStyle) => ({
        name: s.name,
        paints: s.paints,
      })),
      effectStyles: effectStyles.map((s: EffectStyle) => ({
        name: s.name,
        effects: s.effects,
      })),
      variables: varsForUi,
      collections: collectionsForUi,
      variableModes: modes,
    },
  });
}
