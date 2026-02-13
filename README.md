# CSV Price Comparison Tool

A web application to compare two CSV price testing files and generate a difference report.

## Features

- Upload two CSV files via web interface
- Automatically detects which file was generated first based on timestamp
- Calculates differences between matching rows
- Downloads comparison CSV with organized columns

## Deployment on Replit

1. Create a new Repl and select "Node.js" as the language
2. Upload all files from this directory to your Repl
3. Run `npm install` to install dependencies
4. Click "Run" - the app will start automatically
5. Access the web interface through the Replit webview

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the server:

   ```bash
   npm start
   ```

3. Open <http://localhost:3000> in your browser

## Usage

1. Upload the first CSV file
2. Upload the second CSV file
3. Click "Compare Files"
4. The comparison CSV will automatically download

## File Structure

- `replit-server.js` - Express.js server with comparison logic
- `public/index.html` - Web interface for file uploads
- `package.json` - Node.js dependencies
- `.replit` - Replit configuration
