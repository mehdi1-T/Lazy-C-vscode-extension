# Lazy C - Advanced C Development Assistant

> **Supercharge your C programming workflow** with intelligent automation, real-time safety analysis, and instant compilation—all directly in VSCode.

[![VSCode Version](https://img.shields.io/badge/VSCode-1.80+-blue.svg)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🎯 Why lazy C?
![Lazy C icon](icon.png)

Writing C can be tedious and error-prone. lazy C eliminates the busywork and catches common mistakes before they become bugs, letting you focus on building great software.

**Perfect for:**
- Students learning C programming
- Professional developers working on system-level code
- Anyone tired of bugs

---

## ✨ Key Features

### 🤖 **Intelligent Auto-Completion**

#### Auto Semicolon Insertion
Never forget a semicolon again. lazy c intelligently detects when you need one and adds it automatically.

```c
int x = 5       // Press Enter
int x = 5;      // ✓ Semicolon added automatically
```

**Smart enough to skip:**
- Control structures (`if`, `while`, `for`)
- Preprocessor directives (`#include`, `#define`)
- Function declarations
- Comments

#### Auto Header Inclusion
Focus on your logic—lazy C handles the includes. The moment you call a standard library function, the appropriate header is added automatically.

```c
printf("Hello");    // #include <stdio.h> added automatically
strlen("test");     // #include <string.h> added automatically
malloc(100);        // #include <stdlib.h> added automatically
```

**Supports 50+ common functions** from:
- `stdio.h` - Input/output operations
- `stdlib.h` - Memory allocation, utilities
- `string.h` - String manipulation
- `math.h` - Mathematical functions
- `time.h` - Date and time
- `ctype.h` - Character handling

#### Automatic Function Prototypes
Write your functions after `main()` and watch their prototypes appear at the top automatically. No more manual declaration management.

```c
#include <stdio.h>

// Prototype appears here automatically!
int add(int a, int b);

int main() {
    printf("%d", add(5, 3));
    return 0;
}

int add(int a, int b) {  // Write this...
    return a + b;        // ...get the prototype for free
}
```

---

### 🛡️ **Built-In Safety Analysis**

#### Memory Safety Warnings
Get instant reminders about memory management best practices.

```c
char* ptr = malloc(100);
// ℹ️ Remember to free allocated memory

FILE* fp = fopen("data.txt", "r");
// ℹ️ Consider checking if fopen returned NULL
```

#### Unsafe Function Detection
C Helper identifies dangerous functions and suggests secure alternatives in real-time.

| Unsafe Function | Safe Alternative | Why It Matters |
|----------------|------------------|----------------|
| `gets()` | `fgets()` | Buffer overflow protection |
| `strcpy()` | `strncpy()` | Bounds checking |
| `strcat()` | `strncat()` | Prevent buffer overruns |
| `sprintf()` | `snprintf()` | Format string safety |

#### Common Bug Prevention
Catch mistakes before compilation:

```c
if (x = 5) { }  // ⚠️ Possible assignment instead of comparison
```

---

### ⚡ **One-Click Compilation**

Compile and run with a single keystroke. No terminal commands needed.

- **`Ctrl+Shift+B`** - Compile current file
- **`Ctrl+Shift+R`** - Compile and run immediately

**Smart compiler detection:**
- Automatically uses `clang` if available
- Falls back to `gcc` seamlessly
- Output file matches source name (`test.c` → `test.exe`)

---

### 📝 **Code Generation Tools**

#### Main Function Template
Get started instantly with a properly structured main function.

**Shortcut:** `Ctrl+Shift+M`

```c
#include <stdio.h>
#include <stdlib.h>


int main() {
    // Your code here
    return 0;
}
```

#### Function Documentation Generator
Generate professional Doxygen-style documentation automatically.

**Shortcut:** `Ctrl+Shift+D`

Place your cursor on any function and get:

```c
/**
 * @brief Brief description of calculateSum
 *
 * @param arr Description of arr
 * @param size Description of size
 * @return Description of return value
 */
int calculateSum(int arr[], int size) {
    // Implementation
}
```

---

## 🚀 Getting Started

### Prerequisites

- **VSCode** 1.80 or higher
- **GCC** or **Clang** compiler installed and in PATH

### Installation

#### From VSCode Marketplace (Recommended)
1. Open VSCode
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "C Helper"
4. Click **Install**

#### Manual Installation
1. Download the `.vsix` file from releases
2. Open VSCode
3. Go to Extensions → Click `...` → Install from VSIX
4. Select the downloaded file

### Verify Installation

1. Create a new file: `test.c`
2. The extension should auto-populate a main function template
3. Try typing `printf("test")` and press Enter
4. The semicolon should be added automatically!

---

## 📖 Complete Command Reference

### Available Commands

Access via Command Palette (`Ctrl+Shift+P`):

| Command | Description | Shortcut |
|---------|-------------|----------|
| `C Helper: Compile Current File` | Compile to executable (same name as source) | `Ctrl+Shift+B` |
| `C Helper: Compile and Run` | Compile and execute in terminal | `Ctrl+Shift+R` |
| `C Helper: Insert Main Function` | Insert main function template | `Ctrl+Shift+M` |
| `C Helper: Generate Function Documentation` | Create Doxygen-style docs | `Ctrl+Shift+D` |

---

## ⚙️ Configuration

Customize Lazy C to match your workflow:

1. Open Settings: `File > Preferences > Settings`
2. Search for "C Helper"

### Available Settings

```json
{
  "c-helper.autoSemicolon": true,          // Enable auto semicolon insertion
  "c-helper.autoHeaders": true,             // Enable auto header includes
  "c-helper.autoPrototypes": true,          // Enable auto prototype generation
  "c-helper.warningLevel": "medium",        // Warning sensitivity: low/medium/high
  "c-helper.compilerPath": "gcc"           // Compiler path (gcc/clang)
}
```

---

## 💡 Usage Examples

### Example 1: Quick Start from Scratch

```c
// 1. Create new file: calculator.c
// 2. Extension auto-generates:

#include <stdio.h>
#include <stdlib.h>


int main() {
    |  // Cursor positioned here
    return 0;
}

// 3. Start coding - semicolons and headers added automatically!
```

### Example 2: Building a Complete Program

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>     // Auto-added when you use strlen()

int multiply(int a, int b);  // Auto-generated prototype

int main() {
    char name[50];
    printf("Enter name: ");     // Auto semicolon
    fgets(name, 50, stdin);     // Auto semicolon
    
    int result = multiply(5, 3); // Auto semicolon
    printf("Result: %d\n", result);
    
    return 0;
}

// Write this function - prototype appears automatically above main()
int multiply(int a, int b) {
    return a * b;
}
```

### Example 3: Safety in Action

```c
#include <stdio.h>
#include <stdlib.h>

int main() {
    // Memory allocation with reminder
    char* buffer = malloc(256);  
    // ℹ️ Remember to free allocated memory
    
    // File handling with NULL check suggestion
    FILE* file = fopen("data.txt", "r");
    // ℹ️ Consider checking if fopen returned NULL
    
    // Prevented bugs
    if (file != NULL) {  // ✓ Good
        // Process file
        fclose(file);
    }
    
    free(buffer);  // ✓ Memory freed
    return 0;
}
```

---

## 🔧 Building from Source

### Development Setup

```bash
# Clone the repository
git clone https://github.com/mehdi1-T/Lazy-C-vscode-extension.git
cd c-helper

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run in development mode
# Press F5 in VSCode to launch Extension Development Host
```

### Package for Distribution

```bash
# Install packaging tool
npm install -g @vscode/vsce

# Create .vsix package
vsce package

# This creates: c-helper-1.0.0.vsix
```

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Report Bugs
- Use the [GitHub Issues](https://github.com/mehdi1-T/Lazy-C-vscode-extension/issues) page
- Include your VSCode version and OS
- Provide a minimal code example

### Suggest Features
- Open a feature request on GitHub
- Explain the use case and expected behavior

### Submit Pull Requests
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### What this means:
✓ Free to use commercially  
✓ Modify and distribute  
✓ Private use allowed  
✓ No warranty provided  

---

## 👨‍💻 Author

**Mehdi Talalha**
- GitHub: [@mehdi1-T](https://github.com/mehdi1-T/Lazy-C-vscode-extension)
- Email: mehditalalha29.com

---   

## 🙏 Acknowledgments

- Inspired by the C programming community
- Built with the VSCode Extension API
- Special thanks to all contributors

---

## 📊 Stats

- **50+ Standard Library Functions** detected
- **4 Safety Checks** running in real-time
- **Zero configuration** required to get started
- **100% Free and Open Source**

---

## 🗺️ Roadmap

### Planned Features
- [ ] Custom snippet library
- [ ] Multi-file project support
- [ ] Makefile generation
- [ ] Debugging integration
- [ ] Code formatting options
- [ ] Structure/enum templates

### Under Consideration
- Support for C++ (as separate mode)
- Integration with static analyzers
- Custom compiler flags configuration

---

## ❓ FAQ

**Q: Does this work with C++?**  
A: Currently optimized for C. C++ support is on the roadmap.

**Q: Can I use a different compiler?**  
A: Yes! Configure your compiler path in settings.

**Q: Does it work on macOS/Linux?**  
A: Absolutely! Fully cross-platform.

**Q: Is my code analyzed online?**  
A: No. All processing happens locally in VSCode.

**Q: Can I disable specific features?**  
A: Yes, all features can be toggled in settings.

---

<div align="center">

### ⭐ If you find C Helper useful, give it a star on GitHub!

**[Report Bug](https://github.com/mehdi1-T/Lazy-C-vscode-extension/issues)** • 
**[Request Feature](https://github.com/mehdi1-T/Lazy-C-vscode-extension/issues)** • 
**[Documentation](https://github.com/mehdi1-T/Lazy-C-vscode-extensionwiki)**

---

**Happy Coding!** 🚀

Made with ❤️ for the C programming community

</div>