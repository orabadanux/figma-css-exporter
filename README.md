# Figma to CSS Exporter

Export your **Figma variables, text styles, paint styles, and effect styles** directly into a clean CSS stylesheet.

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
4. Use the generated stylesheet in your project.

## 🔑 Example Output
```css
:root {
  /* Variables */
  --color-background-primary: #ffffff;
  --spacing-medium: 8px;
  --font-family-body: Inter, sans-serif;

  /* Text styles */
  .text-heading-1 {
    font-family: var(--font-family-body);
    font-size: 32px;
    line-height: 40px;
    font-weight: 700;
  }

  /* Paint styles */
  .gradient-accent {
    background: linear-gradient(90deg, #ff6a00, #ee0979);
  }

  /* Effect styles */
  .shadow-card {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
}

## ⚙️ Export Rules & Clarifications
The exporter applies specific formatting rules when converting Figma tokens and styles to CSS:

- **Units for numbers**
  - Adds `px` to numeric values like spacing, font size, line height, border radius, etc.
  - Leaves **font-weight** values unitless.
  - Leaves **opacity** values as decimals.
- **Colors**
  - Solid fills are output as hex.
  - Colors with transparency are output as `rgba(...)`.
  - Gradients are converted to valid CSS gradient syntax.
- **Variables**
  - Variables are emitted as CSS custom properties inside `:root`.
  - If a variable references another variable, it is kept as a `var(--referenced-token)` instead of being flattened.
- **Text styles**
  - Exported as utility classes.
  - Includes: `font-family`, `font-size`, `line-height`, `font-weight`, and optionally `letter-spacing` & `text-transform`.
- **Effect styles**
  - Shadows are converted into CSS `box-shadow`.
  - Blur effects are mapped to `filter: blur(...)`.
- **Modes**
  - Multiple modes (e.g., Light / Dark) are exported as CSS variables inside `[data-theme="..."]` blocks.

Example of modes:

[data-theme="light"] {
  --color-background-primary: #ffffff;
}

[data-theme="dark"] {
  --color-background-primary: #000000;
}

## 🛠 Development
Install dependencies:

```bash
npm install