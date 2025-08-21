# Figma to CSS

Export your Figma variables, text styles, paint styles, and effect styles directly into a clean CSS stylesheet.

## ✨ Features
- Export **variables** from selected collections
- Export **text styles** (mapped to `font-family`, `font-size`, `line-height`, etc.)
- Export **paint styles** (including solid colors and gradients)
- Export **effect styles** (shadows, blurs)
- Choose which collections or style categories to include
- Generate CSS with support for **multiple modes** (e.g., light/dark themes)
- Download as `.css`

## 🚀 How to Use
1. Open the plugin in your Figma file.
2. Select which variable collections, text styles, paint styles, or effect styles to export.
3. Click **Download CSS**.
4. Download the generated stylesheet for use in your project.

## 🔑 Example Output
```css
:root {
  --color-background-primary: #ffffff;
  --color-background-primary-dark: #1a1a1a;
  --font-family-base: "Helvetica Neue", sans-serif;
  --font-size-body: 16px;
  --shadow-card: 0 4px 12px rgba(0, 0, 0, 0.1);
}
