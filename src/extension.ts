/**
 * C Helper Extension for VSCode
 * Provides intelligent auto-completion, safety warnings, and compilation features for C programming
 * @author Your Name
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

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

// Global variable for reference panel
let referencePanel: vscode.WebviewPanel | undefined;

/**
 * Maps C standard library functions to their documentation
 */
const LIBRARY_DATABASE: any = {
    printf: {
        name: 'printf',
        header: 'stdio.h',
        prototype: 'int printf(const char *format, ...);',
        description: 'Prints formatted output to stdout',
        parameters: [
            { name: 'format', type: 'const char*', description: 'Format string with conversion specifiers' }
        ],
        returnValue: 'Number of characters printed, or negative if error occurs',
        example: 'printf("Hello, %s!\\n", "World");',
        notes: 'Use format specifiers like %d (int), %s (string), %f (float), %x (hex)',
        relatedFunctions: ['fprintf', 'sprintf', 'scanf']
    },
    scanf: {
        name: 'scanf',
        header: 'stdio.h',
        prototype: 'int scanf(const char *format, ...);',
        description: 'Reads formatted input from stdin',
        parameters: [
            { name: 'format', type: 'const char*', description: 'Format string specifying input format' }
        ],
        returnValue: 'Number of successfully read items',
        example: 'int x; scanf("%d", &x);',
        notes: '⚠️ UNSAFE! Use fgets() with sscanf() for safer input',
        relatedFunctions: ['fscanf', 'sscanf', 'printf']
    },
    fprintf: {
        name: 'fprintf',
        header: 'stdio.h',
        prototype: 'int fprintf(FILE *stream, const char *format, ...);',
        description: 'Prints formatted output to a file stream',
        parameters: [
            { name: 'stream', type: 'FILE*', description: 'Output file stream' },
            { name: 'format', type: 'const char*', description: 'Format string' }
        ],
        returnValue: 'Number of characters printed',
        example: 'fprintf(fp, "Error: %s\\n", message);',
        notes: 'Similar to printf but writes to a file',
        relatedFunctions: ['printf', 'sprintf', 'fscanf']
    },
    sprintf: {
        name: 'sprintf',
        header: 'stdio.h',
        prototype: 'int sprintf(char *str, const char *format, ...);',
        description: 'Prints formatted output to a string buffer',
        parameters: [
            { name: 'str', type: 'char*', description: 'Destination buffer' },
            { name: 'format', type: 'const char*', description: 'Format string' }
        ],
        returnValue: 'Number of characters printed',
        example: 'sprintf(buffer, "Value: %d", 42);',
        notes: '⚠️ UNSAFE! Use snprintf() instead to avoid buffer overflow',
        relatedFunctions: ['snprintf', 'printf', 'fprintf']
    },
    fgets: {
        name: 'fgets',
        header: 'stdio.h',
        prototype: 'char* fgets(char *str, int n, FILE *stream);',
        description: 'Reads a line from a file stream into a buffer',
        parameters: [
            { name: 'str', type: 'char*', description: 'Destination buffer' },
            { name: 'n', type: 'int', description: 'Maximum number of characters to read' },
            { name: 'stream', type: 'FILE*', description: 'Input file stream' }
        ],
        returnValue: 'Pointer to str on success, NULL on EOF or error',
        example: 'fgets(line, 100, stdin);',
        notes: 'Safer than gets(). Reads up to n-1 characters or until newline',
        relatedFunctions: ['gets', 'fputs', 'scanf']
    },
    fputs: {
        name: 'fputs',
        header: 'stdio.h',
        prototype: 'int fputs(const char *str, FILE *stream);',
        description: 'Writes a string to a file stream',
        parameters: [
            { name: 'str', type: 'const char*', description: 'String to write' },
            { name: 'stream', type: 'FILE*', description: 'Output file stream' }
        ],
        returnValue: 'Non-negative value on success, EOF on error',
        example: 'fputs("Hello World\\n", fp);',
        notes: 'Similar to puts but writes to a file stream',
        relatedFunctions: ['puts', 'fgets', 'fprintf']
    },
    fread: {
        name: 'fread',
        header: 'stdio.h',
        prototype: 'size_t fread(void *ptr, size_t size, size_t nmemb, FILE *stream);',
        description: 'Reads binary data from a file stream',
        parameters: [
            { name: 'ptr', type: 'void*', description: 'Pointer to destination buffer' },
            { name: 'size', type: 'size_t', description: 'Size of each element' },
            { name: 'nmemb', type: 'size_t', description: 'Number of elements to read' },
            { name: 'stream', type: 'FILE*', description: 'Input file stream' }
        ],
        returnValue: 'Number of elements successfully read',
        example: 'fread(buffer, sizeof(int), 10, fp);',
        notes: 'Used for binary file I/O',
        relatedFunctions: ['fwrite', 'fgets', 'fopen']
    },
    fwrite: {
        name: 'fwrite',
        header: 'stdio.h',
        prototype: 'size_t fwrite(const void *ptr, size_t size, size_t nmemb, FILE *stream);',
        description: 'Writes binary data to a file stream',
        parameters: [
            { name: 'ptr', type: 'const void*', description: 'Pointer to data to write' },
            { name: 'size', type: 'size_t', description: 'Size of each element' },
            { name: 'nmemb', type: 'size_t', description: 'Number of elements to write' },
            { name: 'stream', type: 'FILE*', description: 'Output file stream' }
        ],
        returnValue: 'Number of elements successfully written',
        example: 'fwrite(data, sizeof(int), 5, fp);',
        notes: 'Used for binary file I/O',
        relatedFunctions: ['fread', 'fputs', 'fopen']
    },
    malloc: {
        name: 'malloc',
        header: 'stdlib.h',
        prototype: 'void* malloc(size_t size);',
        description: 'Allocates memory dynamically on the heap',
        parameters: [
            { name: 'size', type: 'size_t', description: 'Number of bytes to allocate' }
        ],
        returnValue: 'Pointer to allocated memory, or NULL if allocation fails',
        example: 'int *arr = (int*)malloc(10 * sizeof(int));',
        notes: 'Always check if malloc returns NULL. Remember to free() allocated memory.',
        relatedFunctions: ['calloc', 'realloc', 'free']
    },
    calloc: {
        name: 'calloc',
        header: 'stdlib.h',
        prototype: 'void* calloc(size_t nmemb, size_t size);',
        description: 'Allocates memory and initializes it to zero',
        parameters: [
            { name: 'nmemb', type: 'size_t', description: 'Number of elements' },
            { name: 'size', type: 'size_t', description: 'Size of each element' }
        ],
        returnValue: 'Pointer to allocated memory, or NULL if allocation fails',
        example: 'int *arr = (int*)calloc(10, sizeof(int));',
        notes: 'Like malloc but initializes memory to 0. Slightly slower than malloc.',
        relatedFunctions: ['malloc', 'realloc', 'free']
    },
    realloc: {
        name: 'realloc',
        header: 'stdlib.h',
        prototype: 'void* realloc(void *ptr, size_t size);',
        description: 'Changes the size of previously allocated memory',
        parameters: [
            { name: 'ptr', type: 'void*', description: 'Pointer to previously allocated memory' },
            { name: 'size', type: 'size_t', description: 'New size in bytes' }
        ],
        returnValue: 'Pointer to reallocated memory, or NULL if reallocation fails',
        example: 'arr = (int*)realloc(arr, 20 * sizeof(int));',
        notes: 'If realloc fails, original memory is unchanged. Always reassign the result.',
        relatedFunctions: ['malloc', 'calloc', 'free']
    },
    free: {
        name: 'free',
        header: 'stdlib.h',
        prototype: 'void free(void *ptr);',
        description: 'Frees dynamically allocated memory',
        parameters: [
            { name: 'ptr', type: 'void*', description: 'Pointer to memory allocated by malloc/calloc/realloc' }
        ],
        returnValue: 'void (no return value)',
        example: 'free(arr); arr = NULL;',
        notes: 'Always set pointer to NULL after freeing. Double-free causes undefined behavior.',
        relatedFunctions: ['malloc', 'calloc', 'realloc']
    },
    strlen: {
        name: 'strlen',
        header: 'string.h',
        prototype: 'size_t strlen(const char *s);',
        description: 'Returns the length of a string (excluding null terminator)',
        parameters: [
            { name: 's', type: 'const char*', description: 'Pointer to null-terminated string' }
        ],
        returnValue: 'Length of the string as size_t',
        example: 'int len = strlen("hello");  // returns 5',
        notes: 'Does not include the null terminator in the count',
        relatedFunctions: ['strcpy', 'strcat', 'strcmp']
    },
    strcmp: {
        name: 'strcmp',
        header: 'string.h',
        prototype: 'int strcmp(const char *s1, const char *s2);',
        description: 'Compares two strings lexicographically',
        parameters: [
            { name: 's1', type: 'const char*', description: 'First string to compare' },
            { name: 's2', type: 'const char*', description: 'Second string to compare' }
        ],
        returnValue: '0 if equal, negative if s1 < s2, positive if s1 > s2',
        example: 'if (strcmp(str1, str2) == 0) { /* strings are equal */ }',
        notes: 'Case-sensitive comparison. Use strcasecmp for case-insensitive.',
        relatedFunctions: ['strcpy', 'strlen', 'strcat']
    },
    strncmp: {
        name: 'strncmp',
        header: 'string.h',
        prototype: 'int strncmp(const char *s1, const char *s2, size_t n);',
        description: 'Compares first n characters of two strings',
        parameters: [
            { name: 's1', type: 'const char*', description: 'First string' },
            { name: 's2', type: 'const char*', description: 'Second string' },
            { name: 'n', type: 'size_t', description: 'Number of characters to compare' }
        ],
        returnValue: '0 if equal, negative if s1 < s2, positive if s1 > s2',
        example: 'strncmp(str1, str2, 5);',
        notes: 'Safer than strcmp as it limits comparison length',
        relatedFunctions: ['strcmp', 'strlen', 'strcpy']
    },
    strcpy: {
        name: 'strcpy',
        header: 'string.h',
        prototype: 'char* strcpy(char *dest, const char *src);',
        description: 'Copies a string from source to destination',
        parameters: [
            { name: 'dest', type: 'char*', description: 'Destination buffer' },
            { name: 'src', type: 'const char*', description: 'Source string to copy' }
        ],
        returnValue: 'Pointer to dest',
        example: 'strcpy(destination, source);',
        notes: '⚠️ UNSAFE! Can cause buffer overflow. Use strncpy() instead.',
        relatedFunctions: ['strncpy', 'strcat', 'strcmp']
    },
    strncpy: {
        name: 'strncpy',
        header: 'string.h',
        prototype: 'char* strncpy(char *dest, const char *src, size_t n);',
        description: 'Safely copies up to n characters from source to destination',
        parameters: [
            { name: 'dest', type: 'char*', description: 'Destination buffer' },
            { name: 'src', type: 'const char*', description: 'Source string' },
            { name: 'n', type: 'size_t', description: 'Maximum number of characters to copy' }
        ],
        returnValue: 'Pointer to dest',
        example: 'strncpy(dest, src, 100);',
        notes: 'Safer than strcpy. Specify buffer size to prevent overflow.',
        relatedFunctions: ['strcpy', 'strcat', 'strlen']
    },
    strcat: {
        name: 'strcat',
        header: 'string.h',
        prototype: 'char* strcat(char *dest, const char *src);',
        description: 'Concatenates two strings',
        parameters: [
            { name: 'dest', type: 'char*', description: 'Destination string buffer' },
            { name: 'src', type: 'const char*', description: 'Source string to append' }
        ],
        returnValue: 'Pointer to dest',
        example: 'strcat(str1, str2);',
        notes: '⚠️ UNSAFE! Use strncat() instead',
        relatedFunctions: ['strncat', 'strcpy', 'strlen']
    },
    strncat: {
        name: 'strncat',
        header: 'string.h',
        prototype: 'char* strncat(char *dest, const char *src, size_t n);',
        description: 'Safely concatenates up to n characters',
        parameters: [
            { name: 'dest', type: 'char*', description: 'Destination string buffer' },
            { name: 'src', type: 'const char*', description: 'Source string' },
            { name: 'n', type: 'size_t', description: 'Maximum characters to append' }
        ],
        returnValue: 'Pointer to dest',
        example: 'strncat(dest, src, 50);',
        notes: 'Safer than strcat. Always specify maximum length.',
        relatedFunctions: ['strcat', 'strcpy', 'strlen']
    },
    strchr: {
        name: 'strchr',
        header: 'string.h',
        prototype: 'char* strchr(const char *s, int c);',
        description: 'Finds the first occurrence of a character in a string',
        parameters: [
            { name: 's', type: 'const char*', description: 'String to search' },
            { name: 'c', type: 'int', description: 'Character to search for' }
        ],
        returnValue: 'Pointer to first occurrence, or NULL if not found',
        example: 'char *ptr = strchr("hello", \'l\');',
        notes: 'Returns pointer to the character, not the index',
        relatedFunctions: ['strstr', 'strrchr', 'strlen']
    },
    strstr: {
        name: 'strstr',
        header: 'string.h',
        prototype: 'char* strstr(const char *haystack, const char *needle);',
        description: 'Finds the first occurrence of a substring in a string',
        parameters: [
            { name: 'haystack', type: 'const char*', description: 'String to search in' },
            { name: 'needle', type: 'const char*', description: 'Substring to search for' }
        ],
        returnValue: 'Pointer to first occurrence, or NULL if not found',
        example: 'char *pos = strstr("Hello World", "World");',
        notes: 'Case-sensitive search',
        relatedFunctions: ['strchr', 'strlen', 'strcmp']
    },
    atoi: {
        name: 'atoi',
        header: 'stdlib.h',
        prototype: 'int atoi(const char *str);',
        description: 'Converts a string to an integer',
        parameters: [
            { name: 'str', type: 'const char*', description: 'String containing integer' }
        ],
        returnValue: 'Converted integer value, or 0 on error',
        example: 'int num = atoi("123");',
        notes: 'Returns 0 if conversion fails. No error indication.',
        relatedFunctions: ['atof', 'strtol', 'sprintf']
    },
    atof: {
        name: 'atof',
        header: 'stdlib.h',
        prototype: 'double atof(const char *str);',
        description: 'Converts a string to a floating point number',
        parameters: [
            { name: 'str', type: 'const char*', description: 'String containing float' }
        ],
        returnValue: 'Converted double value',
        example: 'double d = atof("3.14");',
        notes: 'Returns 0.0 on error',
        relatedFunctions: ['atoi', 'strtod', 'sprintf']
    },
    fopen: {
        name: 'fopen',
        header: 'stdio.h',
        prototype: 'FILE* fopen(const char *filename, const char *mode);',
        description: 'Opens a file and returns a FILE pointer',
        parameters: [
            { name: 'filename', type: 'const char*', description: 'Name of file to open' },
            { name: 'mode', type: 'const char*', description: 'Mode: "r" (read), "w" (write), "a" (append), "r+" (read/write)' }
        ],
        returnValue: 'FILE pointer on success, NULL on failure',
        example: 'FILE *file = fopen("data.txt", "r"); if (file == NULL) { /* handle error */ }',
        notes: 'Always check if fopen returns NULL before using the file pointer. Remember to fclose().',
        relatedFunctions: ['fclose', 'fread', 'fwrite', 'fprintf']
    },
    fclose: {
        name: 'fclose',
        header: 'stdio.h',
        prototype: 'int fclose(FILE *stream);',
        description: 'Closes a file stream',
        parameters: [
            { name: 'stream', type: 'FILE*', description: 'FILE pointer to close' }
        ],
        returnValue: '0 on success, EOF on error',
        example: 'fclose(file);',
        notes: 'Always close files when done. Not closing can cause data loss or resource leaks.',
        relatedFunctions: ['fopen', 'fread', 'fwrite']
    },
    abs: {
        name: 'abs',
        header: 'stdlib.h',
        prototype: 'int abs(int j);',
        description: 'Returns the absolute value of an integer',
        parameters: [
            { name: 'j', type: 'int', description: 'Integer value' }
        ],
        returnValue: 'Absolute value',
        example: 'int x = abs(-5);  // returns 5',
        notes: 'For floating point, use fabs() from math.h',
        relatedFunctions: ['fabs', 'labs', 'sqrt']
    },
    sqrt: {
        name: 'sqrt',
        header: 'math.h',
        prototype: 'double sqrt(double x);',
        description: 'Calculates the square root',
        parameters: [
            { name: 'x', type: 'double', description: 'Non-negative number' }
        ],
        returnValue: 'Square root as double',
        example: 'double root = sqrt(16.0);  // returns 4.0',
        notes: 'Returns NaN for negative values',
        relatedFunctions: ['pow', 'fabs', 'cbrt']
    },
    pow: {
        name: 'pow',
        header: 'math.h',
        prototype: 'double pow(double x, double y);',
        description: 'Calculates x raised to the power of y',
        parameters: [
            { name: 'x', type: 'double', description: 'Base value' },
            { name: 'y', type: 'double', description: 'Exponent' }
        ],
        returnValue: 'Result of x^y',
        example: 'double result = pow(2.0, 3.0);  // returns 8.0',
        notes: 'Returns 1.0 for 0^0',
        relatedFunctions: ['sqrt', 'exp', 'log']
    },
    ceil: {
        name: 'ceil',
        header: 'math.h',
        prototype: 'double ceil(double x);',
        description: 'Rounds up to the nearest integer',
        parameters: [
            { name: 'x', type: 'double', description: 'Floating point number' }
        ],
        returnValue: 'Smallest integer >= x as double',
        example: 'double y = ceil(3.2);  // returns 4.0',
        notes: 'Rounds toward positive infinity',
        relatedFunctions: ['floor', 'round', 'trunc']
    },
    floor: {
        name: 'floor',
        header: 'math.h',
        prototype: 'double floor(double x);',
        description: 'Rounds down to the nearest integer',
        parameters: [
            { name: 'x', type: 'double', description: 'Floating point number' }
        ],
        returnValue: 'Largest integer <= x as double',
        example: 'double y = floor(3.8);  // returns 3.0',
        notes: 'Rounds toward negative infinity',
        relatedFunctions: ['ceil', 'round', 'trunc']
    },
    round: {
        name: 'round',
        header: 'math.h',
        prototype: 'double round(double x);',
        description: 'Rounds to the nearest integer',
        parameters: [
            { name: 'x', type: 'double', description: 'Floating point number' }
        ],
        returnValue: 'Rounded value as double',
        example: 'double y = round(3.5);  // returns 4.0',
        notes: 'Halfway cases round away from zero',
        relatedFunctions: ['ceil', 'floor', 'trunc']
    },
    isdigit: {
        name: 'isdigit',
        header: 'ctype.h',
        prototype: 'int isdigit(int c);',
        description: 'Checks if a character is a digit (0-9)',
        parameters: [
            { name: 'c', type: 'int', description: 'Character to check' }
        ],
        returnValue: 'Non-zero if digit, 0 otherwise',
        example: 'if (isdigit(\'5\')) { /* is digit */ }',
        notes: 'Pass unsigned char or EOF for safety',
        relatedFunctions: ['isalpha', 'isalnum', 'isspace']
    },
    isalpha: {
        name: 'isalpha',
        header: 'ctype.h',
        prototype: 'int isalpha(int c);',
        description: 'Checks if a character is alphabetic (a-z, A-Z)',
        parameters: [
            { name: 'c', type: 'int', description: 'Character to check' }
        ],
        returnValue: 'Non-zero if alphabetic, 0 otherwise',
        example: 'if (isalpha(\'a\')) { /* is letter */ }',
        notes: 'Locale-dependent',
        relatedFunctions: ['isdigit', 'isalnum', 'isupper']
    },
    isalnum: {
        name: 'isalnum',
        header: 'ctype.h',
        prototype: 'int isalnum(int c);',
        description: 'Checks if a character is alphanumeric',
        parameters: [
            { name: 'c', type: 'int', description: 'Character to check' }
        ],
        returnValue: 'Non-zero if alphanumeric, 0 otherwise',
        example: 'if (isalnum(\'a\') || isalnum(\'5\')) { /* alphanumeric */ }',
        notes: 'True for letters and digits',
        relatedFunctions: ['isalpha', 'isdigit', 'isspace']
    },
    isspace: {
        name: 'isspace',
        header: 'ctype.h',
        prototype: 'int isspace(int c);',
        description: 'Checks if a character is whitespace',
        parameters: [
            { name: 'c', type: 'int', description: 'Character to check' }
        ],
        returnValue: 'Non-zero if whitespace, 0 otherwise',
        example: 'if (isspace(\' \')) { /* is space */ }',
        notes: 'Includes space, tab, newline, carriage return',
        relatedFunctions: ['isdigit', 'isalpha', 'toupper']
    },
    toupper: {
        name: 'toupper',
        header: 'ctype.h',
        prototype: 'int toupper(int c);',
        description: 'Converts a character to uppercase',
        parameters: [
            { name: 'c', type: 'int', description: 'Character to convert' }
        ],
        returnValue: 'Uppercase equivalent, or c unchanged',
        example: 'char up = (char)toupper(\'a\');  // returns \'A\'',
        notes: 'Non-alphabetic characters unchanged',
        relatedFunctions: ['tolower', 'isalpha', 'isupper']
    },
    tolower: {
        name: 'tolower',
        header: 'ctype.h',
        prototype: 'int tolower(int c);',
        description: 'Converts a character to lowercase',
        parameters: [
            { name: 'c', type: 'int', description: 'Character to convert' }
        ],
        returnValue: 'Lowercase equivalent, or c unchanged',
        example: 'char low = (char)tolower(\'A\');  // returns \'a\'',
        notes: 'Non-alphabetic characters unchanged',
        relatedFunctions: ['toupper', 'isalpha', 'islower']
    },
    memcpy: {
        name: 'memcpy',
        header: 'string.h',
        prototype: 'void* memcpy(void *dest, const void *src, size_t n);',
        description: 'Copies n bytes from source to destination',
        parameters: [
            { name: 'dest', type: 'void*', description: 'Destination pointer' },
            { name: 'src', type: 'const void*', description: 'Source pointer' },
            { name: 'n', type: 'size_t', description: 'Number of bytes to copy' }
        ],
        returnValue: 'Pointer to dest',
        example: 'memcpy(dst, src, 100);',
        notes: 'Does not check for overlap. Use memmove() if overlap possible.',
        relatedFunctions: ['memmove', 'memset', 'strcpy']
    },
    memset: {
        name: 'memset',
        header: 'string.h',
        prototype: 'void* memset(void *s, int c, size_t n);',
        description: 'Sets n bytes of memory to a value',
        parameters: [
            { name: 's', type: 'void*', description: 'Pointer to memory' },
            { name: 'c', type: 'int', description: 'Value to set (typically 0)' },
            { name: 'n', type: 'size_t', description: 'Number of bytes to set' }
        ],
        returnValue: 'Pointer to s',
        example: 'memset(buffer, 0, 100);',
        notes: 'Commonly used to initialize memory to 0',
        relatedFunctions: ['memcpy', 'memmove', 'calloc']
    },
    time: {
        name: 'time',
        header: 'time.h',
        prototype: 'time_t time(time_t *tloc);',
        description: 'Gets the current calendar time',
        parameters: [
            { name: 'tloc', type: 'time_t*', description: 'Pointer to store time, or NULL' }
        ],
        returnValue: 'Seconds since epoch (Jan 1, 1970)',
        example: 'time_t t = time(NULL);',
        notes: 'Returns -1 on error',
        relatedFunctions: ['clock', 'difftime', 'ctime']
    },
    rand: {
        name: 'rand',
        header: 'stdlib.h',
        prototype: 'int rand(void);',
        description: 'Generates a pseudo-random number',
        parameters: [],
        returnValue: 'Random integer between 0 and RAND_MAX',
        example: 'int r = rand() % 100;',
        notes: 'Call srand() first to seed. Results are predictable without seeding.',
        relatedFunctions: ['srand', 'random', 'time']
    },
    srand: {
        name: 'srand',
        header: 'stdlib.h',
        prototype: 'void srand(unsigned int seed);',
        description: 'Seeds the random number generator',
        parameters: [
            { name: 'seed', type: 'unsigned int', description: 'Seed value' }
        ],
        returnValue: 'void',
        example: 'srand(time(NULL));',
        notes: 'Call once before using rand()',
        relatedFunctions: ['rand', 'time', 'random']
    },
    exit: {
        name: 'exit',
        header: 'stdlib.h',
        prototype: 'void exit(int status);',
        description: 'Terminates the program',
        parameters: [
            { name: 'status', type: 'int', description: 'Exit status code (0 for success)' }
        ],
        returnValue: 'Does not return',
        example: 'exit(0);',
        notes: 'Flushes and closes all streams before terminating',
        relatedFunctions: ['abort', 'return', 'main']
    },
    getchar: {
        name: 'getchar',
        header: 'stdio.h',
        prototype: 'int getchar(void);',
        description: 'Reads a single character from stdin',
        parameters: [],
        returnValue: 'Character as int, or EOF on error',
        example: 'int c = getchar();',
        notes: 'Returns EOF at end of input',
        relatedFunctions: ['putchar', 'scanf', 'fgetc']
    },
    putchar: {
        name: 'putchar',
        header: 'stdio.h',
        prototype: 'int putchar(int c);',
        description: 'Writes a single character to stdout',
        parameters: [
            { name: 'c', type: 'int', description: 'Character to output' }
        ],
        returnValue: 'Character written, or EOF on error',
        example: 'putchar(\'A\');',
        notes: 'Equivalent to printf("%c", c)',
        relatedFunctions: ['getchar', 'printf', 'fputc']
    },
    perror: {
        name: 'perror',
        header: 'stdio.h',
        prototype: 'void perror(const char *s);',
        description: 'Prints error message based on errno',
        parameters: [
            { name: 's', type: 'const char*', description: 'Prefix message to print' }
        ],
        returnValue: 'void',
        example: 'if (file == NULL) perror("fopen");',
        notes: 'Appends system error message to custom prefix',
        relatedFunctions: ['strerror', 'printf', 'fprintf']
    }
};

// ============================================================================
// LIBRARY REFERENCE VIEW PROVIDER (Sidebar Panel)
// ============================================================================

class LibraryReferenceViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'c-helper.libraryReference';
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        try {
            this._view = webviewView;

            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [this._context.extensionUri]
            };

            webviewView.webview.html = this._getHtmlContent(webviewView.webview);

            // Handle messages from webview
            webviewView.webview.onDidReceiveMessage(data => {
                try {
                    this._handleWebviewMessage(data);
                } catch (error) {
                    console.error('Error handling webview message:', error);
                }
            });
        } catch (error) {
            console.error('Error resolving webview view:', error);
        }
    }

    private _handleWebviewMessage(message: any) {
        try {
            if (!message || typeof message !== 'object') {
                return;
            }
            
            const { command, query } = message;
            
            if (command === 'search' && typeof query === 'string') {
                const searchTerm = query.toLowerCase().trim();
                
                // Search by function name or header file
                const results = Object.values(LIBRARY_DATABASE).filter((func: any) => {
                    if (!func) return false;
                    
                    // Search by function name
                    if (func.name && func.name.toLowerCase().includes(searchTerm)) {
                        return true;
                    }
                    
                    // Search by header file (e.g., "stdio.h" or just "stdio")
                    if (func.header) {
                        const headerTerm = searchTerm.endsWith('.h') ? searchTerm : searchTerm + '.h';
                        if (func.header.toLowerCase().includes(headerTerm) || 
                            func.header.toLowerCase().includes(searchTerm)) {
                            return true;
                        }
                    }
                    
                    return false;
                });

                this._view?.webview.postMessage({
                    command: 'searchResults',
                    results: results
                }).then(() => {}, (e: any) => console.error('Error posting message:', e));
            }
        } catch (error) {
            console.error('Error in message handler:', error);
        }
    }

    private _getHtmlContent(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>C Library Reference</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    padding: 12px;
                    line-height: 1.6;
                    font-size: 12px;
                }

                .container {
                    max-width: 100%;
                }

                .header {
                    margin-bottom: 16px;
                    text-align: center;
                }

                .header h1 {
                    font-size: 16px;
                    margin-bottom: 4px;
                    color: var(--vscode-foreground);
                }

                .header p {
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                }

                .search-box {
                    margin-bottom: 16px;
                    display: flex;
                    gap: 6px;
                }

                .search-box input {
                    flex: 1;
                    padding: 6px 8px;
                    border: 1px solid var(--vscode-inputBorder);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 3px;
                    font-size: 12px;
                }

                .search-box input:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }

                .search-box button {
                    padding: 6px 12px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                }

                .search-box button:hover {
                    background: var(--vscode-button-hoverBackground);
                }

                .results {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .function-card {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 12px;
                    background: var(--vscode-panel-background);
                    transition: all 0.2s;
                }

                .function-card:hover {
                    background: var(--vscode-list-hoverBackground);
                    border-color: var(--vscode-focusBorder);
                }

                .function-name {
                    font-size: 13px;
                    font-weight: 600;
                    color: #569cd6;
                    margin-bottom: 4px;
                    font-family: 'Courier New', monospace;
                }

                .function-header {
                    font-size: 10px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 6px;
                    font-family: 'Courier New', monospace;
                }

                .function-prototype {
                    font-size: 11px;
                    color: #ce9178;
                    margin-bottom: 6px;
                    padding: 6px;
                    background: var(--vscode-editor-background);
                    border-left: 2px solid #569cd6;
                    border-radius: 2px;
                    font-family: 'Courier New', monospace;
                    overflow-x: auto;
                }

                .function-description {
                    font-size: 11px;
                    color: var(--vscode-foreground);
                    margin-bottom: 6px;
                }

                .section {
                    margin-top: 8px;
                    font-size: 11px;
                }

                .section-title {
                    font-size: 10px;
                    font-weight: 600;
                    color: #dcdcaa;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    margin-bottom: 4px;
                }

                .parameters, .return-value, .example, .notes {
                    font-size: 11px;
                    color: var(--vscode-foreground);
                    margin-bottom: 4px;
                    padding: 6px;
                    background: var(--vscode-editor-background);
                    border-radius: 2px;
                    overflow-x: auto;
                }

                .example {
                    font-family: 'Courier New', monospace;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    max-height: 80px;
                }

                .notes {
                    color: #ce9178;
                    border-left: 2px solid #f48771;
                }

                .parameter-item {
                    margin-bottom: 4px;
                    padding-left: 8px;
                }

                .parameter-name {
                    font-family: 'Courier New', monospace;
                    color: #569cd6;
                    font-weight: 500;
                }

                .no-results {
                    text-align: center;
                    padding: 20px 12px;
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                }

                .related-functions {
                    font-size: 11px;
                    color: var(--vscode-foreground);
                }

                .related-functions span {
                    color: #569cd6;
                    margin-right: 6px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📚 C Manual</h1>
                    <p>Search functions or headers</p>
                </div>

                <div class="search-box">
                    <input type="text" id="searchInput" placeholder="printf, stdio.h, malloc..." />
                    <button id="searchBtn">Search</button>
                </div>

                <div id="results" class="results">
                    <div class="no-results">Search by function name or header file (e.g., stdio.h, ctype.h)</div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const searchInput = document.getElementById('searchInput');
                const searchBtn = document.getElementById('searchBtn');
                const resultsDiv = document.getElementById('results');

                searchBtn.addEventListener('click', () => {
                    try {
                        performSearch();
                    } catch (error) {
                        console.error('Search error:', error);
                    }
                });

                searchInput.addEventListener('keypress', e => {
                    try {
                        if (e.key === 'Enter') performSearch();
                    } catch (error) {
                        console.error('Keypress error:', error);
                    }
                });

                function performSearch() {
                    try {
                        const query = searchInput.value.trim();
                        if (query.length === 0) {
                            resultsDiv.innerHTML = '<div class="no-results">Enter a function name...</div>';
                            return;
                        }
                        vscode.postMessage({
                            command: 'search',
                            query: query
                        });
                    } catch (error) {
                        console.error('performSearch error:', error);
                        resultsDiv.innerHTML = '<div class="no-results">Search error. Check console.</div>';
                    }
                }

                window.addEventListener('message', event => {
                    try {
                        if (event.data && event.data.command === 'searchResults') {
                            displayResults(event.data.results || []);
                        }
                    } catch (error) {
                        console.error('Message handler error:', error);
                    }
                });

                function displayResults(results) {
                    try {
                        if (!results || results.length === 0) {
                            resultsDiv.innerHTML = '<div class="no-results">No functions found.</div>';
                            return;
                        }

                        resultsDiv.innerHTML = results.map(func => {
                            try {
                                if (!func || !func.name) return '';
                                
                                return \`
                                    <div class="function-card">
                                        <div class="function-name">\${func.name || 'Unknown'}()</div>
                                        <div class="function-header">Header: &lt;\${func.header || 'stdio.h'}&gt;</div>
                                        
                                        <div class="function-prototype">\${func.prototype || ''}</div>

                                        <div class="function-description">\${func.description || ''}</div>

                                        \${func.parameters && func.parameters.length > 0 ? \`
                                            <div class="section">
                                                <div class="section-title">📝 Params</div>
                                                <div class="parameters">
                                                    \${func.parameters.map(p => {
                                                        if (!p) return '';
                                                        return \`
                                                            <div class="parameter-item">
                                                                <span class="parameter-name">\${p.name || 'param'}</span>: \${p.description || ''}
                                                            </div>
                                                        \`;
                                                    }).join('')}
                                                </div>
                                            </div>
                                        \` : ''}

                                        <div class="section">
                                            <div class="section-title">↩️ Returns</div>
                                            <div class="return-value">\${func.returnValue || ''}</div>
                                        </div>

                                        <div class="section">
                                            <div class="section-title">💻 Example</div>
                                            <div class="example">\${func.example || ''}</div>
                                        </div>

                                        \${func.notes ? \`
                                            <div class="section">
                                                <div class="section-title">⚠️ Notes</div>
                                                <div class="notes">\${func.notes}</div>
                                            </div>
                                        \` : ''}

                                        \${func.relatedFunctions && func.relatedFunctions.length > 0 ? \`
                                            <div class="section">
                                                <div class="section-title">🔗 Related</div>
                                                <div class="related-functions">
                                                    \${func.relatedFunctions.map(f => \`<span>\${f || ''}</span>\`).join('')}
                                                </div>
                                            </div>
                                        \` : ''}
                                    </div>
                                \`;
                            } catch (error) {
                                console.error('Error rendering card:', error);
                                return '';
                            }
                        }).join('');
                    } catch (error) {
                        console.error('displayResults error:', error);
                        resultsDiv.innerHTML = '<div class="no-results">Display error. Check console.</div>';
                    }
                }
            </script>
        </body>
        </html>`;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('C Helper Extension activated');

    // Initialize diagnostic collection for warnings and errors
    diagnosticCollection = vscode.languages.createDiagnosticCollection('c-helper');
    context.subscriptions.push(diagnosticCollection);

    // Register event handlers (all automatic)
    registerFileCreationHandler(context);
    registerDocumentOpenHandler(context);
    registerDocumentChangeHandler(context);
    registerDocumentSaveHandler(context);
    
    // Register commands
    registerCommands(context);

    // Register the library reference as a sidebar view provider
    const referenceViewProvider = new LibraryReferenceViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'c-helper.libraryReference',
            referenceViewProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Auto-show library reference when opening C files
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.languageId === 'c') {
                vscode.commands.executeCommand('c-helper.libraryReference.focus').then(() => {}, (e: any) => {
                    console.debug('Could not focus library reference:', e);
                });
            }
        })
    );

    // Legacy command handlers (backward compatibility)
    context.subscriptions.push(
        vscode.commands.registerCommand('c-helper.openReference', () => {
            vscode.commands.executeCommand('c-helper.libraryReference.focus').then(() => {}, (e: any) => {
                console.error('Error opening reference:', e);
            });
        }),
        vscode.commands.registerCommand('c-helper.searchReference', async () => {
            const query = await vscode.window.showInputBox({ 
                placeHolder: 'Enter function name to search...' 
            });
            if (query) {
                await searchReference(query, context);
            }
        })
    );
}

export function deactivate() {
    try {
        if (diagnosticCollection) {
            diagnosticCollection.clear();
            diagnosticCollection.dispose();
        }
        if (prototypeCheckTimer) {
            clearTimeout(prototypeCheckTimer);
            prototypeCheckTimer = undefined;
        }
        if (referencePanel) {
            referencePanel.dispose();
            referencePanel = undefined;
        }
    } catch (error) {
        console.error('Error during deactivation:', error);
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
                    // Longer timeout to avoid race conditions
                    setTimeout(() => {
                        setupNewCFile(file).catch(error => {
                            console.error('Error in setupNewCFile:', error);
                        });
                    }, 200);
                }
            });
        })
    );
}

function registerDocumentOpenHandler(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            if (document.languageId === 'c' && document.getText().trim() === '') {
                setTimeout(() => {
                    setupNewCFileFromDocument(document).catch(error => {
                        console.error('Error in setupNewCFileFromDocument:', error);
                    });
                }, 100);
            } else if (document.languageId === 'c' && document.getText().trim() !== '') {
                // Auto-add headers for existing non-empty C files when opened
                setTimeout(() => {
                    autoAddRequiredHeaders(document).catch(error => {
                        console.error('Error in autoAddRequiredHeaders on file open:', error);
                    });
                }, 100);
            }
        })
    );
}

function registerDocumentChangeHandler(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId !== 'c' || isProcessingChange) {
                return;
            }
            
            try {
                // Handle semicolon insertion on newline
                for (const change of event.contentChanges) {
                    if (change.text.includes('\n')) {
                        const lineNum = change.range.start.line;
                        setTimeout(() => addSemicolonIfNeeded(event.document, lineNum), 10);
                    }
                    // Auto-add headers when functions are typed
                    if (change.text.match(/\w+\s*\(/)) {
                        autoAddRequiredHeaders(event.document);
                    }
                }
                
                // Schedule prototype generation check
                if (prototypeCheckTimer) {
                    clearTimeout(prototypeCheckTimer);
                }
                prototypeCheckTimer = setTimeout(() => {
                    autoGeneratePrototypes(event.document);
                }, 1500);
            } catch (error) {
                console.error('Error in document change handler:', error);
            }
        })
    );
}

function registerDocumentSaveHandler(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            if (document.languageId === 'c') {
                try {
                    runDiagnostics(document);
                    autoGeneratePrototypes(document).catch(error => {
                        console.error('Error in auto-generate prototypes on save:', error);
                    });
                    autoAddRequiredHeaders(document).catch(error => {
                        console.error('Error in auto-add headers on save:', error);
                    });
                } catch (error) {
                    console.error('Error in document save handler:', error);
                }
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
    try {
        const document = await vscode.workspace.openTextDocument(uri);
        if (document.getText().trim() === '') {
            await setupNewCFileFromDocument(document);
        }
    } catch (error) {
        console.error('Error opening C file:', error);
        vscode.window.showErrorMessage(`Failed to open C file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function setupNewCFileFromDocument(document: vscode.TextDocument) {
    try {
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
    } catch (error) {
        console.error('Error setting up C file:', error);
        isProcessingChange = false;
        vscode.window.showErrorMessage('Failed to setup C file template');
    }
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
    
    try {
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
    } catch (error) {
        console.error('Error adding semicolon:', error);
        isProcessingChange = false;
    }
}

async function autoAddRequiredHeaders(document: vscode.TextDocument) {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
            return;
        }

        const documentText = document.getText();
        const lines = documentText.split('\n');
        
        // Get all currently included headers
        const includedHeaders = new Set<string>();
        for (const line of lines) {
            const match = line.match(/#include\s*[<"](.+?)[>"]/);
            if (match) {
                includedHeaders.add(match[1]);
            }
        }

        // Find all function calls in the document (skip comments)
        const requiredHeaders = new Set<string>();
        const functionPattern = /\b([a-zA-Z_]\w*)\s*\(/g;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip comment lines
            const commentIndex = line.indexOf('//');
            const checkLine = commentIndex !== -1 ? line.substring(0, commentIndex) : line;
            
            let match;
            const regex = new RegExp(functionPattern);
            while ((match = regex.exec(checkLine)) !== null) {
                const functionName = match[1];
                const header = FUNCTION_TO_HEADER[functionName];
                
                if (header && !includedHeaders.has(header)) {
                    requiredHeaders.add(header);
                }
            }
        }

        // Add missing headers
        if (requiredHeaders.size === 0) {
            return;
        }

        isProcessingChange = true;

        // Find insertion point (after last #include or at top)
        let insertionLine = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('#include')) {
                insertionLine = i + 1;
            }
        }

        const headersToAdd = Array.from(requiredHeaders).sort();
        const headerText = headersToAdd.map(h => `#include <${h}>`).join('\n') + '\n';

        await editor.edit(editBuilder => {
            const insertPos = new vscode.Position(insertionLine, 0);
            editBuilder.insert(insertPos, headerText);
        }).then(() => {
            isProcessingChange = false;
        }, (e: any) => {
            console.error('Error adding headers:', e);
            isProcessingChange = false;
        });
    } catch (error) {
        console.error('Error in autoAddRequiredHeaders:', error);
        isProcessingChange = false;
    }
}

function shouldAddSemicolon(text: string): boolean {
    try {
        const trimmed = text.trim();
        
        // Empty line or already has semicolon
        if (!trimmed || trimmed.endsWith(';')) {
            return false;
        }
        
        // Lines ending with special characters that don't need semicolons
        if (/[{},:\\]$/.test(trimmed)) {
            return false;
        }
        
        // Preprocessor directives and comments
        if (/^#|^\/\/|^\/\*|\*\/$/.test(trimmed)) {
            return false;
        }
        
        // Control structures without body on same line
        if (/^\s*(if|else\s+if|else|while|for|do|switch)\b/.test(trimmed)) {
            return false;
        }
        if (/^\s*(case|default)\b/.test(trimmed)) {
            return false;
        }
        
        // Function definitions (return type + name + params without opening brace)
        if (/^\s*(int|void|char|float|double|long|short|unsigned|signed)\s+\w+\s*\([^)]*\)\s*$/.test(trimmed)) {
            return false;
        }
        
        // Type definitions
        if (/^\s*(struct|union|enum|typedef)\b/.test(trimmed)) {
            return false;
        }
        
        // Standalone braces
        if (/^\s*[{}]\s*$/.test(trimmed)) {
            return false;
        }
        
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
    } catch (error) {
        console.error('Error in shouldAddSemicolon:', error);
        return false;
    }
}

// ============================================================================
// AUTOMATIC PROTOTYPE GENERATION
// ============================================================================

async function autoGeneratePrototypes(document: vscode.TextDocument) {
    if (isProcessingChange) {
        return;
    }
    
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
        return;
    }
    
    try {
        const text = document.getText();
        const lines = text.split('\n');

        // Find the last #include directive
        let lastIncludeLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('#include')) {
                lastIncludeLine = i;
            }
        }

        if (lastIncludeLine === -1) {
            return;
        }

        // Find the main function
        let mainLine = -1;
        for (let i = lastIncludeLine + 1; i < lines.length; i++) {
            if (/^\s*(int|void)\s+main\s*\(/.test(lines[i])) {
                mainLine = i;
                break;
            }
        }

        if (mainLine === -1) {
            return;
        }

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

        if (foundFunctions.length === 0) {
            return;
        }

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
    } catch (error) {
        console.error('Error generating prototypes:', error);
        isProcessingChange = false;
    }
}

// ============================================================================
// DIAGNOSTICS (WARNINGS AND SUGGESTIONS)
// ============================================================================

function runDiagnostics(document: vscode.TextDocument) {
    if (!diagnosticCollection) {
        console.warn('Diagnostic collection not initialized');
        return;
    }
    
    try {
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
    } catch (error) {
        console.error('Error running diagnostics:', error);
    }
}

function checkUnsafeFunctions(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
    // Skip comments and strings
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        return;
    }
    
    for (const [unsafeFunc, safeFunc] of Object.entries(UNSAFE_FUNCTIONS)) {
        if (line.includes(unsafeFunc + '(')) {
            // Make sure it's not in a comment
            const commentIndex = line.indexOf('//');
            const funcIndex = line.indexOf(unsafeFunc);
            if (commentIndex !== -1 && funcIndex > commentIndex) {
                continue; // Skip if in comment
            }
            
            const range = new vscode.Range(lineNumber, funcIndex, lineNumber, funcIndex + unsafeFunc.length);
            diagnostics.push(new vscode.Diagnostic(
                range,
                `Unsafe function '${unsafeFunc}'. Consider using '${safeFunc}' instead.`,
                vscode.DiagnosticSeverity.Warning
            ));
        }
    }
}

function checkAssignmentInConditional(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
    // Skip comments
    const commentIndex = line.indexOf('//');
    const checkLine = commentIndex !== -1 ? line.substring(0, commentIndex) : line;
    
    if (/if\s*\([^)]*[^=!<>]=(?!=)[^)]*\)/.test(checkLine)) {
        const index = checkLine.indexOf('if');
        const range = new vscode.Range(lineNumber, index, lineNumber, checkLine.length);
        diagnostics.push(new vscode.Diagnostic(
            range,
            'Possible assignment instead of comparison in conditional statement',
            vscode.DiagnosticSeverity.Warning
        ));
    }
}

function checkMemoryAllocation(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
    // Skip comments
    const commentIndex = line.indexOf('//');
    const checkLine = commentIndex !== -1 ? line.substring(0, commentIndex) : line;
    
    if (/\b(malloc|calloc|realloc)\s*\(/.test(checkLine)) {
        const match = checkLine.match(/\b(malloc|calloc|realloc)/);
        if (match) {
            const index = checkLine.indexOf(match[0]);
            const range = new vscode.Range(lineNumber, index, lineNumber, checkLine.length);
            diagnostics.push(new vscode.Diagnostic(
                range,
                'Remember to free allocated memory to prevent memory leaks',
                vscode.DiagnosticSeverity.Information
            ));
        }
    }
}

function checkFopenWithoutNullCheck(lines: string[], line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]) {
    // Skip comments
    const commentIndex = line.indexOf('//');
    const checkLine = commentIndex !== -1 ? line.substring(0, commentIndex) : line;
    
    if (checkLine.includes('fopen(')) {
        const nextLines = lines.slice(lineNumber + 1, Math.min(lineNumber + 5, lines.length)).join('\n');
        // Check for NULL check or error handling
        const hasNullCheck = /\bNULL\b/.test(nextLines) || /\b!=\s*NULL|==\s*NULL\b/.test(nextLines);
        const hasErrorHandling = /\bif\s*\(/.test(nextLines) || /perror/.test(nextLines);
        
        if (!hasNullCheck && !hasErrorHandling) {
            const index = checkLine.indexOf('fopen');
            const range = new vscode.Range(lineNumber, index, lineNumber, checkLine.length);
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
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'c') {
            vscode.window.showErrorMessage('No C file is currently open');
            return;
        }

        // Check if file is saved
        if (editor.document.isDirty) {
            Promise.resolve(editor.document.save()).then(() => {
                executeCompile(editor);
            }).catch((error: any) => {
                vscode.window.showErrorMessage(`Failed to save file: ${error?.message || 'Unknown error'}`);
            });
        } else {
            executeCompile(editor);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Compilation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

function executeCompile(editor: vscode.TextEditor) {
    try {
        const filePath = editor.document.uri.fsPath;
        const fileName = path.basename(filePath, '.c');
        const fileDir = path.dirname(filePath);
        const outputPath = path.join(fileDir, `${fileName}.exe`);

        // Validate paths exist
        if (!filePath || !fileDir) {
            vscode.window.showErrorMessage('Invalid file path');
            return;
        }

        const terminal = vscode.window.createTerminal('C Compiler');
        terminal.show();
        
        // Platform-specific compilation command
        const isWindows = process.platform === 'win32';
        let compileCmd: string;
        
        if (isWindows) {
            compileCmd = `clang "${filePath}" -o "${outputPath}" 2>nul || gcc "${filePath}" -o "${outputPath}"`;
        } else {
            compileCmd = `clang "${filePath}" -o "${outputPath}" 2>/dev/null || gcc "${filePath}" -o "${outputPath}"`;
        }
        
        terminal.sendText(compileCmd);
        vscode.window.showInformationMessage(`Compiling ${fileName}.c → ${fileName}.exe`);
    } catch (error) {
        vscode.window.showErrorMessage(`Compilation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

function compileAndRunCurrentFile() {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'c') {
            vscode.window.showErrorMessage('No C file is currently open');
            return;
        }

        // Check if file is saved
        if (editor.document.isDirty) {
            Promise.resolve(editor.document.save()).then(() => {
                executeCompileAndRun(editor);
            }).catch((error: any) => {
                vscode.window.showErrorMessage(`Failed to save file: ${error?.message || 'Unknown error'}`);
            });
        } else {
            executeCompileAndRun(editor);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Compilation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

function executeCompileAndRun(editor: vscode.TextEditor) {
    try {
        const filePath = editor.document.uri.fsPath;
        const fileName = path.basename(filePath, '.c');
        const fileDir = path.dirname(filePath);
        const outputPath = path.join(fileDir, `${fileName}.exe`);

        // Validate paths exist
        if (!filePath || !fileDir) {
            vscode.window.showErrorMessage('Invalid file path');
            return;
        }

        const terminal = vscode.window.createTerminal('C Compiler & Runner');
        terminal.show();
        
        // Platform-specific compilation and run command
        const isWindows = process.platform === 'win32';
        let compileRunCmd: string;
        
        if (isWindows) {
            // Windows: use && instead of || for sequential execution
            compileRunCmd = `clang "${filePath}" -o "${outputPath}" 2>nul || gcc "${filePath}" -o "${outputPath}" && "${outputPath}"`;
        } else {
            // Unix-like systems
            compileRunCmd = `(clang "${filePath}" -o "${outputPath}" 2>/dev/null || gcc "${filePath}" -o "${outputPath}") && "${outputPath}"`;
        }
        
        terminal.sendText(compileRunCmd);
    } catch (error) {
        vscode.window.showErrorMessage(`Compilation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// ============================================================================
// CODE GENERATION COMMANDS
// ============================================================================

function insertMainFunction() {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const snippet = new vscode.SnippetString(
            '#include <stdio.h>\n#include <stdlib.h>\n\n\nint main() {\n\t${1:// Your code here}\n\treturn 0;\n}'
        );

        Promise.resolve(editor.insertSnippet(snippet)).then(success => {
            if (!success) {
                vscode.window.showWarningMessage('Failed to insert snippet');
            }
        }).catch((error: any) => {
            vscode.window.showErrorMessage(`Failed to insert snippet: ${error?.message || 'Unknown error'}`);
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Error inserting main function: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

function generateFunctionDoc() {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

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

        const editPromise = editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(position.line, 0), documentation);
        });
        
        if (editPromise && typeof editPromise.then === 'function') {
            (editPromise as Promise<boolean>).then(success => {
                if (!success) {
                    vscode.window.showWarningMessage('Could not insert documentation');
                }
            }).catch((error: any) => {
                vscode.window.showErrorMessage(`Failed to insert documentation: ${error?.message || 'Unknown error'}`);
            });
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error generating documentation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// ============================================================================
// C LIBRARY REFERENCE PANEL
// ============================================================================

async function openReferencePanel(context: vscode.ExtensionContext) {
    try {
        if (referencePanel) {
            referencePanel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        referencePanel = vscode.window.createWebviewPanel(
            'cLibraryReference',
            '📚 C Library Reference',
            vscode.ViewColumn.Beside,
            { enableScripts: true, enableFindWidget: true }
        );

        if (!referencePanel) {
            throw new Error('Failed to create webview panel');
        }

        referencePanel.webview.html = getSearchPanelHTML();

        referencePanel.webview.onDidReceiveMessage(message => {
            handleSearchMessage(message);
        });

        referencePanel.onDidDispose(() => {
            if (referencePanel) {
                referencePanel.webview.html = '';
            }
            referencePanel = undefined;
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open reference panel: ${error instanceof Error ? error.message : 'Unknown error'}`);
        referencePanel = undefined;
    }
}

function handleSearchMessage(message: any) {
    try {
        if (!message || typeof message !== 'object') {
            console.warn('Invalid message received');
            return;
        }
        
        if (message.command === 'search' && message.query) {
            const query = String(message.query).toLowerCase().trim();
            
            if (!query) {
                return;
            }
            
            const results = Object.values(LIBRARY_DATABASE).filter((func: any) => {
                if (!func || typeof func !== 'object') {
                    return false;
                }
                
                const name = func.name ? String(func.name).toLowerCase() : '';
                const description = func.description ? String(func.description).toLowerCase() : '';
                const header = func.header ? String(func.header).toLowerCase() : '';
                
                return name.includes(query) ||
                       description.includes(query) ||
                       header.includes(query);
            });

            if (referencePanel?.webview) {
                referencePanel.webview.postMessage({
                    command: 'searchResults',
                    results: results
                });
            }
        }
    } catch (error) {
        console.error('Error handling search message:', error);
    }
}

function getSearchPanelHTML(): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>C Library Reference</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    padding: 16px;
                    line-height: 1.6;
                }

                .container {
                    max-width: 100%;
                }

                .header {
                    margin-bottom: 20px;
                    text-align: center;
                }

                .header h1 {
                    font-size: 24px;
                    margin-bottom: 8px;
                    color: var(--vscode-foreground);
                }

                .header p {
                    color: var(--vscode-descriptionForeground);
                    font-size: 12px;
                }

                .search-box {
                    margin-bottom: 20px;
                    display: flex;
                    gap: 8px;
                }

                .search-box input {
                    flex: 1;
                    padding: 10px 12px;
                    border: 1px solid var(--vscode-inputBorder);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 4px;
                    font-size: 13px;
                }

                .search-box input:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                    box-shadow: 0 0 0 1px var(--vscode-focusBorder);
                }

                .search-box button {
                    padding: 10px 16px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                }

                .search-box button:hover {
                    background: var(--vscode-button-hoverBackground);
                }

                .results {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .function-card {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 16px;
                    background: var(--vscode-panel-background);
                    transition: all 0.2s;
                }

                .function-card:hover {
                    background: var(--vscode-list-hoverBackground);
                    border-color: var(--vscode-focusBorder);
                }

                .function-name {
                    font-size: 16px;
                    font-weight: 600;
                    color: #569cd6;
                    margin-bottom: 6px;
                    font-family: 'Courier New', monospace;
                }

                .function-header {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 10px;
                    padding: 6px 8px;
                    background: var(--vscode-editor-background);
                    border-radius: 3px;
                    font-family: 'Courier New', monospace;
                }

                .function-prototype {
                    font-size: 12px;
                    color: #ce9178;
                    margin-bottom: 10px;
                    padding: 8px;
                    background: var(--vscode-editor-background);
                    border-left: 3px solid #569cd6;
                    border-radius: 2px;
                    font-family: 'Courier New', monospace;
                    overflow-x: auto;
                }

                .function-description {
                    font-size: 13px;
                    color: var(--vscode-foreground);
                    margin-bottom: 10px;
                }

                .section {
                    margin-top: 12px;
                }

                .section-title {
                    font-size: 12px;
                    font-weight: 600;
                    color: #dcdcaa;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 6px;
                }

                .parameters, .return-value, .example, .notes {
                    font-size: 12px;
                    color: var(--vscode-foreground);
                    margin-bottom: 8px;
                    padding: 8px;
                    background: var(--vscode-editor-background);
                    border-radius: 3px;
                    overflow-x: auto;
                }

                .example {
                    font-family: 'Courier New', monospace;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }

                .notes {
                    color: #ce9178;
                    border-left: 3px solid #f48771;
                }

                .parameter-item {
                    margin-bottom: 6px;
                    padding-left: 12px;
                }

                .parameter-name {
                    font-family: 'Courier New', monospace;
                    color: #569cd6;
                    font-weight: 500;
                }

                .no-results {
                    text-align: center;
                    padding: 40px 20px;
                    color: var(--vscode-descriptionForeground);
                }

                .related-functions {
                    font-size: 12px;
                    color: var(--vscode-foreground);
                }

                .related-functions span {
                    color: #569cd6;
                    margin-right: 8px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📚 Lazy C Manual</h1>
                    <p>C standard library manual pages</p>
                </div>

                <div class="search-box">
                    <input type="text" id="searchInput" placeholder="Search functions (e.g., printf, malloc, strlen)..." />
                    <button id="searchBtn">Search</button>
                </div>

                <div id="results" class="results">
                    <div class="no-results">Start searching to see results...</div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const searchInput = document.getElementById('searchInput');
                const searchBtn = document.getElementById('searchBtn');
                const resultsDiv = document.getElementById('results');

                searchBtn.addEventListener('click', () => {
                    try {
                        performSearch();
                    } catch (error) {
                        console.error('Search error:', error);
                    }
                });
                searchInput.addEventListener('keypress', e => {
                    try {
                        if (e.key === 'Enter') performSearch();
                    } catch (error) {
                        console.error('Keypress error:', error);
                    }
                });

                function performSearch() {
                    try {
                        const query = searchInput.value.trim();
                        if (query.length === 0) {
                            resultsDiv.innerHTML = '<div class="no-results">Enter a search term...</div>';
                            return;
                        }
                        vscode.postMessage({
                            command: 'search',
                            query: query
                        });
                    } catch (error) {
                        console.error('performSearch error:', error);
                        resultsDiv.innerHTML = '<div class="no-results">Error performing search. Check console.</div>';
                    }
                }

                window.addEventListener('message', event => {
                    try {
                        if (event.data && event.data.command === 'searchResults') {
                            displayResults(event.data.results || []);
                        }
                    } catch (error) {
                        console.error('Message handler error:', error);
                    }
                });

                function displayResults(results) {
                    try {
                        if (!results || results.length === 0) {
                            resultsDiv.innerHTML = '<div class="no-results">No functions found. Try a different search term.</div>';
                            return;
                        }

                        resultsDiv.innerHTML = results.map(func => {
                            try {
                                if (!func || !func.name) return '';
                                
                                return \`
                                    <div class="function-card">
                                        <div class="function-name">\${func.name || 'Unknown'}()</div>
                                        <div class="function-header">Header: &lt;\${func.header || 'unknown.h'}&gt;</div>
                                        
                                        <div class="function-prototype">\${func.prototype || ''}</div>

                                        <div class="function-description">\${func.description || ''}</div>

                                        \${func.parameters && func.parameters.length > 0 ? \`
                                            <div class="section">
                                                <div class="section-title">📝 Parameters</div>
                                                <div class="parameters">
                                                    \${func.parameters.map(p => {
                                                        if (!p) return '';
                                                        return \`
                                                            <div class="parameter-item">
                                                                <span class="parameter-name">\${p.name || 'param'}</span> (\${p.type || 'unknown'}): \${p.description || ''}
                                                            </div>
                                                        \`;
                                                    }).join('')}
                                                </div>
                                            </div>
                                        \` : ''}

                                        <div class="section">
                                            <div class="section-title">↩️ Return Value</div>
                                            <div class="return-value">\${func.returnValue || ''}</div>
                                        </div>

                                        <div class="section">
                                            <div class="section-title">💻 Example</div>
                                            <div class="example">\${func.example || ''}</div>
                                        </div>

                                        \${func.notes ? \`
                                            <div class="section">
                                                <div class="section-title">⚠️ Notes</div>
                                                <div class="notes">\${func.notes}</div>
                                            </div>
                                        \` : ''}

                                        \${func.relatedFunctions && func.relatedFunctions.length > 0 ? \`
                                            <div class="section">
                                                <div class="section-title">🔗 Related Functions</div>
                                                <div class="related-functions">
                                                    \${func.relatedFunctions.map(f => \`<span>\${f || ''}</span>\`).join('')}
                                                </div>
                                            </div>
                                        \` : ''}
                                    </div>
                                \`;
                            } catch (error) {
                                console.error('Error rendering function card:', error, func);
                                return '';
                            }
                        }).join('');
                    } catch (error) {
                        console.error('displayResults error:', error);
                        resultsDiv.innerHTML = '<div class="no-results">Error displaying results. Check console.</div>';
                    }
                }
            </script>
        </body>
        </html>
    `;
}

async function searchReference(query: string, context?: vscode.ExtensionContext) {
    const results = Object.values(LIBRARY_DATABASE).filter((func: any) =>
        func.name.toLowerCase().includes(query.toLowerCase())
    );

    if (results.length > 0) {
        if (context) {
            await openReferencePanel(context);
        } else if (!referencePanel) {
            console.warn('Reference panel not available and no context provided');
            return;
        }
        
        if (referencePanel?.webview) {
            referencePanel.webview.postMessage({
                command: 'searchResults',
                results: results
            });
        }
    } else {
        vscode.window.showInformationMessage(`No functions found matching "${query}"`);
    }
}