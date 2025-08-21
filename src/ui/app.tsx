import React, { useEffect, useState } from "react";
import { generateCSS, GenerateCSSOptions } from "../common/generateCSS";

type Payload = any;

export default function App() {
  const [cssOutput, setCssOutput] = useState("");
  const [data, setData] = useState<Payload | null>(null);

  const [options, setOptions] = useState<GenerateCSSOptions>({
    includeTextStyles: true,
    includePaintStyles: true,
    includeEffectStyles: true,
    includeVariables: true,
    selectedCollectionIds: undefined,
    preferTokenRefs: true,
    numberUnit: "px",
  });

  const [selectedCollections, setSelectedCollections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlH = html.style.height;
    const prevBodyH = body.style.height;
    const prevBodyMargin = body.style.margin;

    html.style.height = "100%";
    body.style.height = "100%";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.margin = "0";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.height = prevHtmlH;
      body.style.height = prevBodyH;
      body.style.margin = prevBodyMargin;
    };
  }, []);

  useEffect(() => {
    window.addEventListener("error", (e) =>
      console.error("UI error:", e.error || e.message)
    );
    window.addEventListener("unhandledrejection", (e) =>
      console.error("UI unhandled:", e.reason)
    );

    window.onmessage = (event) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === "styles-data") {
        setData(msg.payload);

        const init: Record<string, boolean> = {};
        (msg.payload.collections || []).forEach((c: any) => (init[c.id] = true));
        setSelectedCollections(init);

        const selectedIds = Object.keys(init).filter((id) => init[id]);
        const css = generateCSS(msg.payload, {
          ...options,
          selectedCollectionIds: selectedIds,
        });
        setCssOutput(css);
      }
    };

    parent.postMessage({ pluginMessage: { type: "ui-ready" } }, "*");
  }, []);

  useEffect(() => {
    if (!data) return;
    const selectedIds = Object.entries(selectedCollections)
      .filter(([, v]) => v)
      .map(([id]) => id);

    const css = generateCSS(data, {
      ...options,
      selectedCollectionIds: selectedIds,
    });
    setCssOutput(css);
  }, [options, selectedCollections, data]);

  const toggleOption = (k: keyof GenerateCSSOptions) =>
    setOptions((prev) => ({ ...prev, [k]: !prev[k] }));

  const toggleCollection = (id: string) =>
    setSelectedCollections((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleDownload = () => {
    const blob = new Blob([cssOutput], { type: "text/css" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tokens.css";
    link.click();
    URL.revokeObjectURL(url);
  };

  const hasData = !!data;
  const totalCollections = data?.collections?.length ?? 0;
  const selectedCount = Object.values(selectedCollections).filter(Boolean).length;

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        padding: 12,
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Arial, sans-serif",
        color: "#111",
        boxSizing: "border-box",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: 12,
        background: "#fff",
      }}
    >

      <header>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
          Figma CSS Exporter
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#555" }}>
          Choose what to include. Then download the generated CSS.
        </p>
      </header>

      <main
        style={{
          background: "#fff",
          padding: 0,
          display: "grid",
          gap: 16,
          alignContent: "start",
        }}
      >

        <section>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
            Include
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <CheckRow
              checked={options.includeVariables}
              onChange={() => toggleOption("includeVariables")}
              label="Variables"
            />
            <CheckRow
              checked={options.includeTextStyles}
              onChange={() => toggleOption("includeTextStyles")}
              label="Text styles"
            />
            <CheckRow
              checked={options.includePaintStyles}
              onChange={() => toggleOption("includePaintStyles")}
              label="Paint styles"
            />
            <CheckRow
              checked={options.includeEffectStyles}
              onChange={() => toggleOption("includeEffectStyles")}
              label="Effect styles"
            />
          </div>
        </section>

        {hasData && (data?.collections?.length ?? 0) > 0 && (
          <section>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
              Variable collections{" "}
              <span style={{ color: "#888", fontWeight: 400 }}>
                ({selectedCount}/{totalCollections})
              </span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {data.collections.map((c: any) => (
                <CheckRow
                  key={c.id}
                  checked={!!selectedCollections[c.id]}
                  onChange={() => toggleCollection(c.id)}
                  label={c.name}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer
        style={{
          position: "sticky",
          bottom: 0,
          background: "linear-gradient(#ffffff00, #ffffff 60%)",
          paddingTop: 8,
          borderTop: "1px solid #eee",
        }}
      >
        <button
          onClick={handleDownload}
          disabled={!cssOutput}
          style={{
            width: "100%",
            height: 48,
            borderRadius: 12,
            border: "1px solid #0a66ff",
            background: cssOutput ? "#0a66ff" : "#b7c8ff",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: 0.2,
            cursor: cssOutput ? "pointer" : "not-allowed",
            boxShadow: cssOutput ? "0 2px 10px rgba(10,102,255,.22)" : "none",
            transition: "transform .05s ease, box-shadow .2s ease, background .2s ease",
          }}
          onMouseDown={(e) => {
            if (!cssOutput) return;
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(1px)";
          }}
          onMouseUp={(e) => {
            if (!cssOutput) return;
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
          }}
        >
          Download CSS
        </button>
        <div style={{ marginTop: 6, textAlign: "center", fontSize: 11, color: "#666" }}>
          {cssOutput
            ? "CSS is generated based on your selections."
            : "Waiting for data… open a file with styles/variables."}
        </div>
      </footer>
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "20px 1fr",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        border: "1px solid #eee",
        borderRadius: 10,
        background: "#fff",
        fontSize: 13.5,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{
          width: 18,
          height: 18,
          accentColor: "#0a66ff",
          cursor: "pointer",
        }}
      />
      <span
        title={label}
        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {label}
      </span>
    </label>
  );
}
