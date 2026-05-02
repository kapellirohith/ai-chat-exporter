# AI Chat Exporter

A powerful Google Chrome extension designed to perfectly capture, format, and export long AI conversations (from ChatGPT, Claude, Gemini, etc.) and full webpages so you can seamlessly transfer them to other AI models without losing context or images.

## Features

- **💬 Capture Chat Only:** Intelligently isolates the core conversation from complex web apps like ChatGPT, completely removing sidebars, menus, and unnecessary navigation junk.
- **📄 Capture Whole Webpage:** Grabs the full text and layout of any webpage.
- **🖼️ Image Support:** Captures and deduplicates all relevant images on the page and bundles them into the export payload.
- **📄 Export to PDF:** Native, clean, and beautifully formatted PDF generation that bundles your text and images into one document, allowing you to bypass CORS and copy/paste limits when uploading to another AI.
- **🧠 AI-Optimized Formatting:** Wraps your copied text in a structured Prompt Header so the receiving AI instantly understands the context, the source URL, and what to do with it.

## Why this exists
When you try to copy/paste a long ChatGPT or Claude conversation to another AI, you often run into missing images, broken text formatting, or you accidentally copy the entire sidebar and confuse the receiving AI. AI Chat Exporter solves this by doing the extraction cleanly and structuring it perfectly for AI consumption.

## Installation (Developer Mode)

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"** and select the folder containing this extension.
5. Pin the extension to your toolbar!

## How to Use

1. Open a conversation in ChatGPT, Claude, or any webpage.
2. **Important:** If your conversation is very long, scroll all the way to the top of the chat to force the browser to render all the messages!
3. Click the **AI Chat Exporter** icon in your Chrome toolbar.
4. Choose **💬 Capture Chat Only** for a clean transcript, or **📄 Capture Whole Webpage**.
5. The extension will save the context locally. Click **Copy Text** or **Save as PDF** to export!

## Privacy & Security
This extension runs entirely locally in your browser. It uses `chrome.storage.local` to securely save your recent captures. No data is ever sent to an external server by the extension itself.
