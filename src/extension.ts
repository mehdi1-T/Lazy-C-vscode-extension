/**
 * C Helper Extension for VSCode
 * Provides intelligent auto-completion, safety warnings, and compilation features for C programming
 * @author Your Name
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import * as path from 'path';

// ============================================================================
// CONSTANTS AND MAPPINGS
// ============================================================================

/**
 * Maps common C standard library functions to their required header files
 */
const FUNCTION_TO_HEADER: { [key: string]: string } = {
    // stdio.h
    'printf': 'stdio.h', 'scanf': 'stdio.h', 'fprintf': 'stdio.h', 'fscanf': 'stdio.h',
    'fopen': 'stdio.h', 'fclose': 'stdio.h', 'fgets': 'stdio.h', 'fputs': 'stdio.h',
    'fread': 'stdio.h', 'fwrite': 'stdio.h', 'sprintf': 'stdio.h', 'sscanf': 'stdio.h',
    'puts': 'stdio.h', 'getchar': 'stdio.h', 'putchar': 'stdio.h', 'perror': 'stdio.h',
    'fgetc': 'stdio.h', 'fputc': 'stdio.h', 'fseek': 'stdio.h', 'ftell': 'stdio.h',
    
    // stdlib.h
    'malloc': 'stdlib.h', 'calloc': 'stdlib.h', 'realloc': 'stdlib.h', 'free': 'stdlib.h',
    'exit': 'stdlib.h', 'atoi': 'stdlib.h', 'atof': 'stdlib.h', 'rand': 'stdlib.h', 
    'srand': 'stdlib.h', 'abs': 'stdlib.h', 'system': 'stdlib.h', 'getenv': 'stdlib.h',
    
    // string.h
    'strcpy': 'string.h', 'strncpy': 'string.h', 'strcat': 'string.h', 'strncat': 'string.h',
    'strlen': 'string.h', 'strcmp': 'string.h', 'strncmp': 'string.h', 'strchr': 'string.h',
    'strstr': 'string.h', 'memcpy': 'string.h', 'memset': 'string.h', 'memmove': 'string.h',
    'memcmp': 'string.h', 'strdup': 'string.h',
    
    // math.h
    'sqrt': 'math.h', 'pow': 'math.h', 'sin': 'math.h', 'cos': 'math.h', 'tan': 'math.h',
    'floor': 'math.h', 'ceil': 'math.h', 'fabs': 'math.h', 'exp': 'math.h', 'log': 'math.h',
    'round': 'math.h', 'fmod': 'math.h',
    
    // time.h
    'time': 'time.h', 'clock': 'time.h', 'difftime': 'time.h', 'strftime': 'time.h',
    
    // ctype.h
    'isalpha': 'ctype.h', 'isdigit': 'ctype.h', 'isalnum': 'ctype.h', 'toupper': 'ctype.h',
    'tolower': 'ctype.h', 'isspace': 'ctype.h', 'ispunct': 'ctype.h', 'isupper': 'ctype.h',
    'islower': 'ctype.h'
};

/**
 * Maps unsafe C functions to their safer alternatives
 */
const UNSAFE_FUNCTIONS: { [key: string]: string } = {
    'gets': 'fgets',
    'strcpy': 'strncpy',
    'strcat': 'strncat',
    'sprintf': 'snprintf'
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

let diagnosticCollection: vscode.DiagnosticCollection;
let isProcessingChange = false;
let prototypeCheckTimer: NodeJS.Timeout | undefined;

// ============================================================================
// ACTIVATION AND DEACTIVATION
// ============================================================================

/**
 * Called when the extension is activated
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('C Helper Extension activated');

    // Initialize diagnostic collection for warnings and errors
    diagnosticCollection = vscode.languages.createDiagnosticCollection('c-helper');
    context.subscriptions.push(diagnosticCollection);

    // Register event handlers
    registerFileCreationHandler(context);
    registerDocumentOpenHandler(context);
    registerDocumentChangeHandler(context);
    registerDocumentSaveHandler(context);
    
    // Register commands
    registerCommands(context);
}

/**
 * Called when the extension is deactivated
 */
export function deactivate() {
    if (diagnosticCollection) {
        diagnosticCollection.clear();
        diagnosticCollection.dispose();
    }
    if (prototypeCheckTimer) {
        clearTimeout(prototypeCheckTimer);
    }
}

// ============================================================================
// EVENT HANDLER REGISTRATION
// ============================================================================

function registerFileCreationHandler(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidCreateFiles(event => {
            event.files.forEach(file => {
                if (file.fsPath.endsWith('.c')) {
                    setTimeout(() => setupNewCFile(file), 100);
                }
            });
        })
    );
}

function registerDocumentOpenHandler(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            if (document.languageId === 'c' && document.getText().trim() === '') {
                setTimeout(() => setupNewCFileFromDocument(document), 100);
            }
        })
    );
}

function registerDocumentChangeHandler(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId !== 'c' || isProcessingChange) return;
            
            // Handle semicolon insertion on newline
            for (const change of event.contentChanges) {
                if (change.text.includes('\n')) {
                    const lineNum = change.range.start.line;
                    setTimeout(() => addSemicolonIfNeeded(event.document, lineNum), 10);
                }
            }
            
            // Schedule prototype generation check
            if (prototypeCheckTimer) {
                clearTimeout(prototypeCheckTimer);
            }
            prototypeCheckTimer = setTimeout(() => {
                autoGeneratePrototypes(event.document);
            }, 1500);
        })
    );
}

function registerDocumentSaveHandler(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            if (document.languageId === 'c') {
                runDiagnostics(document);
                autoGeneratePrototypes(document);
            }
        })
    );
}

function registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('c-helper.compile', compileCurrentFile),
        vscode.commands.registerCommand('c-helper.compileAndRun', compileAndRunCurrentFile),
        vscode.commands.registerCommand('c-helper.insertMain', insertMainFunction),
        vscode.commands.registerCommand('c-helper.generateDoc', generateFunctionDoc)
    );
}

// ============================================================================
// FILE SETUP
// ============================================================================

async function setupNewCFile(uri: vscode.Uri) {
    const document = await vscode.workspace.openTextDocument(uri);
    if (document.getText().trim() === '') {
        await setupNewCFileFromDocument(document);
    }
}

async function setupNewCFileFromDocument(document: vscode.TextDocument) {
    const editor = await vscode.window.showTextDocument(document);
    
    isProcessingChange = true;
    
    const initialTemplate = `#include <stdio.h>
#include <stdlib.h>


int main() {
\t
\treturn 0;
}`;

    await editor.edit(editBuilder => {
        editBuilder.insert(new vscode.Position(0, 0), initialTemplate);
    });

    // Place cursor inside main function
    const cursorPosition = new vscode.Position(5, 1);
    editor.selection = new vscode.Selection(cursorPosition, cursorPosition);
    
    setTimeout(() => { isProcessingChange = false; }, 300);
}

// ============================================================================
// SEMICOLON AUTO-INSERTION
// ============================================================================

async function addSemicolonIfNeeded(document: vscode.TextDocument, lineNum: number) {
    if (isProcessingChange || lineNum < 0 || lineNum >= document.lineCount) {
        return;
    }
    
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
        return;
    }
    
    const line = document.lineAt(lineNum);
    const text = line.text.trimEnd();
    
    if (shouldAddSemicolon(text)) {
        isProcessingChange = true;
        
        await editor.edit(editBuilder => {
            editBuilder.insert(line.range.end, ';');
        }, { 
            undoStopBefore: false, 
            undoStopAfter: false 
        });
        
        setTimeout(() => { isProcessingChange = false; }, 50);
    }
}

function shouldAddSemicolon(text: string): boolean {
    const trimmed = text.trim();
    
    // Empty line or already has semicolon
    if (!trimmed || trimmed.endsWith(';')) return false;
    
    // Lines ending with special characters that don't need semicolons
    if (/[{},:\\]$/.test(trimmed)) return false;
    
    // Preprocessor directives and comments
    if (/^#|^\/\/|^\/\*|\*\/$/.test(trimmed)) return false;
    
    // Control structures without body on same line
    if (/^\s*(if|else\s+if|else|while|for|do|switch)\b/.test(trimmed)) return false;
    if (/^\s*(case|default)\b/.test(trimmed)) return false;
    
    // Function definitions (return type + name + params without opening brace)
    if (/^\s*(int|void|char|float|double|long|short|unsigned|signed)\s+\w+\s*\([^)]*\)\s*$/.test(trimmed)) return false;
    
    // Type definitions
    if (/^\s*(struct|union|enum|typedef)\b/.test(trimmed)) return false;
    
    // Standalone braces
    if (/^\s*[{}]\s*$/.test(trimmed)) return false;
    
    // Check for patterns that DO need semicolons
    const needsSemicolonPatterns = [
        /^\s*(int|char|float|double|void|long|short|unsigned|signed|const|static|extern|auto|register)\s+\w+/,
        /\w+\s*=\s*[^=]/,
        /^\s*(return|break|continue|goto)\b/,
        /\w+\s*\([^)]*\)(?!\s*\{)/,
        /\w+\s*\[[^\]]*\]\s*=/,
        /\*\w+\s*=/,
    ];
    
    return needsSemicolonPatterns.some(pattern => pattern.test(trimmed));
}

// ============================================================================
// AUTOMATIC PROTOTYPE GENERATION
// ============================================================================

async function autoGeneratePrototypes(document: vscode.TextDocument) {
    if (isProcessingChange) return;
    
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) return;

    const text = document.getText();
    const lines = text.split('\n');

    // Find the last #include directive
    let lastIncludeLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('#include')) {
            lastIncludeLine = i;
        }
    }

    if (lastIncludeLine === -1) return;

    // Find the main function
    let mainLine = -1;
    for (let i = lastIncludeLine + 1; i < lines.length; i++) {
        if (/^\s*(int|void)\s+main\s*\(/.test(lines[i])) {
            mainLine = i;
            break;
        }
    }

    if (mainLine === -1) return;

    // Find all user-defined functions after main
    const functionPattern = /^\s*(int|void|char|float|double|long|short|unsigned|signed)\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*\{/;
    const foundFunctions: Array<{ name: string; prototype: string }> = [];

    for (let i = mainLine + 1; i < lines.length; i++) {
        const match = lines[i].match(functionPattern);
        if (match) {
            const returnType = match[1];
            const functionName = match[2];
            const parameters = match[3].trim();
            
            if (functionName !== 'main') {
                foundFunctions.push({
                    name: functionName,
                    prototype: `${returnType} ${functionName}(${parameters});`
                });
            }
        }
    }

    if (foundFunctions.length === 0) return;

    // Check which prototypes are missing
    const prototypeArea = lines.slice(lastIncludeLine + 1, mainLine).join('\n');
    const missingPrototypes = foundFunctions.filter(func => {
        const pattern = new RegExp(`\\b${func.name}\\s*\\([^)]*\\)\\s*;`);
        return !pattern.test(prototypeArea);
    });

    if (missingPrototypes.length > 0) {
        isProcessingChange = true;
        
        await editor.edit(editBuilder => {
            const insertPosition = new vscode.Position(lastIncludeLine + 1, 0);
            const prototypesText = '\n' + missingPrototypes.map(f => f.prototype).join('\n') + '\n';
            editBuilder.insert(insertPosition, prototypesText);
        });
        
        setTimeout(() => { isProcessingChange = false; }, 200);
    }
}

// ============================================================================
// DIAGNOSTICS (WARNINGS AND SUGGESTIONS)
// ============================================================================

function runDiagnostics(document: vscode.TextDocument) {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for unsafe functions
        checkUnsafeFunctions(line, i, diagnostics);
        
        // Check for assignment in conditional
        checkAssignmentInConditional(line, i, diagnostics);
        
        // Check for memory allocation without free
        checkMemoryAllocation(line, i, diagnostics);
        
        // Check for fopen without NULL check
        checkFopenWithoutNullCheck(lines, line, i, diagnostics);
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

function checkUnsafeFunctions(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
    for (const [unsafeFunc, safeFunc] of Object.entries(UNSAFE_FUNCTIONS)) {
        if (line.includes(unsafeFunc + '(')) {
            const index = line.indexOf(unsafeFunc);
            const range = new vscode.Range(lineNumber, index, lineNumber, index + unsafeFunc.length);
            diagnostics.push(new vscode.Diagnostic(
                range,
                `Unsafe function '${unsafeFunc}'. Consider using '${safeFunc}' instead.`,
                vscode.DiagnosticSeverity.Warning
            ));
        }
    }
}

function checkAssignmentInConditional(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
    if (/if\s*\([^)]*[^=!<>]=(?!=)[^)]*\)/.test(line)) {
        const index = line.indexOf('if');
        const range = new vscode.Range(lineNumber, index, lineNumber, line.length);
        diagnostics.push(new vscode.Diagnostic(
            range,
            'Possible assignment instead of comparison in conditional statement',
            vscode.DiagnosticSeverity.Warning
        ));
    }
}

function checkMemoryAllocation(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
    if (/\b(malloc|calloc|realloc)\s*\(/.test(line)) {
        const match = line.match(/\b(malloc|calloc|realloc)/);
        if (match) {
            const index = line.indexOf(match[0]);
            const range = new vscode.Range(lineNumber, index, lineNumber, line.length);
            diagnostics.push(new vscode.Diagnostic(
                range,
                'Remember to free allocated memory to prevent memory leaks',
                vscode.DiagnosticSeverity.Information
            ));
        }
    }
}

function checkFopenWithoutNullCheck(lines: string[], line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
    if (line.includes('fopen(')) {
        const nextLines = lines.slice(lineNumber + 1, Math.min(lineNumber + 4, lines.length)).join('\n');
        if (!/\bNULL\b/.test(nextLines) && !/\bif\b/.test(nextLines)) {
            const index = line.indexOf('fopen');
            const range = new vscode.Range(lineNumber, index, lineNumber, line.length);
            diagnostics.push(new vscode.Diagnostic(
                range,
                'Consider checking if fopen() returned NULL before using the file pointer',
                vscode.DiagnosticSeverity.Information
            ));
        }
    }
}

// ============================================================================
// COMPILATION COMMANDS
// ============================================================================

function compileCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'c') {
        vscode.window.showErrorMessage('No C file is currently open');
        return;
    }

    editor.document.save();

    const filePath = editor.document.uri.fsPath;
    const fileName = path.basename(filePath, '.c');
    const fileDir = path.dirname(filePath);
    const outputPath = path.join(fileDir, `${fileName}.exe`);

    const terminal = vscode.window.createTerminal('C Compiler');
    terminal.show();
    
    // Try clang first, fallback to gcc
    terminal.sendText(`clang "${filePath}" -o "${outputPath}" 2>/dev/null || gcc "${filePath}" -o "${outputPath}"`);
    
    vscode.window.showInformationMessage(`Compiling ${fileName}.c → ${fileName}.exe`);
}

function compileAndRunCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'c') {
        vscode.window.showErrorMessage('No C file is currently open');
        return;
    }

    editor.document.save();

    const filePath = editor.document.uri.fsPath;
    const fileName = path.basename(filePath, '.c');
    const fileDir = path.dirname(filePath);
    const outputPath = path.join(fileDir, `${fileName}.exe`);

    const terminal = vscode.window.createTerminal('C Compiler & Runner');
    terminal.show();
    
    // Compile and run
    terminal.sendText(`(clang "${filePath}" -o "${outputPath}" 2>/dev/null || gcc "${filePath}" -o "${outputPath}") && "${outputPath}"`);
}

// ============================================================================
// CODE GENERATION COMMANDS
// ============================================================================

function insertMainFunction() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const snippet = new vscode.SnippetString(
        '#include <stdio.h>\n#include <stdlib.h>\n\n\nint main() {\n\t${1:// Your code here}\n\treturn 0;\n}'
    );

    editor.insertSnippet(snippet);
}

function generateFunctionDoc() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const text = line.text;

    const functionMatch = text.match(/(\w+)\s+(\w+)\s*\(([^)]*)\)/);
    if (!functionMatch) {
        vscode.window.showErrorMessage('Place cursor on a function declaration to generate documentation');
        return;
    }

    const [, returnType, functionName, params] = functionMatch;
    const parameterList = params.split(',').map(p => p.trim()).filter(p => p);

    let documentation = '/**\n';
    documentation += ` * @brief Brief description of ${functionName}\n`;
    documentation += ' *\n';
    
    for (const param of parameterList) {
        const paramName = param.split(/\s+/).pop() || '';
        documentation += ` * @param ${paramName} Description of ${paramName}\n`;
    }
    
    if (returnType !== 'void') {
        documentation += ` * @return Description of return value\n`;
    }
    
    documentation += ' */\n';

    editor.edit(editBuilder => {
        editBuilder.insert(new vscode.Position(position.line, 0), documentation);
    });
}