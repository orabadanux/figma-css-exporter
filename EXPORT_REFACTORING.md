# CSS Export Refactoring - Separated Files by Collection

## Overview
The Figma CSS Exporter has been refactored to export CSS variables organized by collection, with each collection becoming its own file. This respects the actual structure of your design system and makes management much simpler.

## New Export Structure

### Output Files

**Collection Files:**
- `<CollectionName>.css` - For collections without modes (single mode)
- `<CollectionName>-<ModeName>.css` - For collections with multiple modes (one file per mode)

**Styles File:**
- `Styles.css` - Contains all Figma styles (text styles, paint styles, effect styles)

## Examples

### Single Mode Collection
If you have a collection named "Global", it will export as:
```
Global.css
```

### Multi-Mode Collection  
If you have a collection named "Component Tokens" with modes "Light" and "Dark", it will export as:
```
Component Tokens-Light.css
Component Tokens-Dark.css
```

### Complete Export Example
For a design system with collections:
- Global
- Semantic
- Component Tokens (with Light, Dark modes)
- Typography

The exported files would be:
```
Global.css
Semantic.css
Component Tokens-Light.css
Component Tokens-Dark.css
Typography.css
Styles.css (if paint/effect/text styles exist)
```

## Implementation Details

### Dependencies Added
- **jszip** (^3.10.1) - Used for creating ZIP archives of CSS files

### Type Changes

#### New Type: `GeneratedCSSFiles`
```typescript
export type GeneratedCSSFiles = {
  collections: Record<string, string>; // <CollectionName>.css or <CollectionName>-<ModeName>.css
  styles?: string; // Styles.css (paint, effect, text styles)
};
```

### Core Function Changes

#### `generateCSS(payload, options): GeneratedCSSFiles`
**Previous behavior:** Returned a single CSS string with all tokens concatenated

**New behavior:** Returns an object containing:
- `collections`: A dictionary where keys are filenames and values are CSS content
- `styles`: Optional CSS content for all Figma styles (paints, effects, text styles)

The function now:
1. Iterates through each variable collection
2. For collections with multiple modes, generates one file per mode
3. For collections with single mode, generates one file per collection
4. Generates all styles (paint, effect, text) into a single `Styles.css` file

#### `generateCSSLegacy(payload, options): string`
A backward-compatibility function that combines all generated files into a single string.

## Collection Processing Logic

For each collection in your design system:

1. **Check if collection is selected** (based on collection selection filters)
2. **Check for multiple modes**:
   - If YES → Create `<CollectionName>-<ModeName>.css` for each mode
   - If NO → Create `<CollectionName>.css`
3. **Include variables** based on `includeVariables` option

Styles are collected separately:
- Text styles → `Styles.css`
- Paint styles → `Styles.css`
- Effect styles → `Styles.css`

## UI Changes

### Download Handling
The UI now:
1. **Single File Export:** If only one CSS file is generated, downloads it directly as a `.css` file
2. **Multiple File Export:** If multiple files are generated, creates a `design-tokens.zip` file containing all CSS files

### ZIP File Contents
When downloading multiple files, the ZIP archive will contain:
- All collection files: `<CollectionName>.css` or `<CollectionName>-<ModeName>.css`
- Styles file (if present): `Styles.css`

### Browser Download Behavior
- Single file downloads directly to your Downloads folder (or configured default)
- Multiple files are packaged into a single ZIP that downloads automatically
- This eliminates the need for multiple download windows

### Download Message
The UI displays a helpful message:
- If 1 file: "CSS file is generated based on your selections."
- If 2+ files: "X CSS files will be downloaded as a ZIP."

## Migration Notes

### For Users
- Download behavior remains intuitive: click "Download CSS" and files are automatically downloaded
- All previous customization options continue to work:
  - Include Variables
  - Include Text Styles
  - Include Paint Styles
  - Include Effect Styles
- Collection selection still allows filtering which collections to include
- Each file now corresponds exactly to your design system structure

### For Developers
- If you need the old single-file format, use `generateCSSLegacy()`
- The new `GeneratedCSSFiles` type provides better structure
- Each collection generates independently, making it easier to process specific collections

## Key Benefits

1. **Respects Design System Structure:** Files map directly to your collections
2. **Multi-Mode Support:** Dark mode, light mode, etc. get separate files automatically
3. **Cleaner Organization:** No guessing about categorization - it's based on your actual structure
4. **Easy Integration:** Import only the files your component needs
5. **Flexible:** Works with any collection naming convention

## Testing

To verify the refactored functionality:

1. Create a Figma file with multiple collections
2. Add at least one collection with multiple modes (e.g., light/dark)
3. Add some styles (paint, effect, text)
4. Export using the plugin:
   - Verify each collection creates its own file
   - Verify multi-mode collections create one file per mode
   - Verify Styles.css contains all styles
   - Verify file downloads work correctly

Example structure to test:
```
Collections:
  - Global (single mode)
  - Semantic (single mode)
  - Component Tokens (light, dark modes)
  
Styles:
  - Text styles
  - Paint styles
  - Effect styles
```

Expected output:
```
Global.css
Semantic.css
Component Tokens-light.css
Component Tokens-dark.css
Styles.css
```
