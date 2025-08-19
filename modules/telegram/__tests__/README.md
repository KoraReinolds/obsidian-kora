# MarkdownToTelegramConverter Tests

Comprehensive test suite for the Markdown to Telegram converter with 100+ test cases covering all functionality.

## Test Structure

### 📁 Test Files

1. **`markdown-to-telegram-converter.test.ts`** - Core functionality tests
   - Basic text processing
   - Frontmatter and header removal
   - All formatting types (bold, italic, code, etc.)
   - Blockquotes and expandable quotes
   - Links and spoilers
   - Length limits and truncation
   - Validation

2. **`edge-cases.test.ts`** - Edge cases and stress tests
   - Performance with large documents
   - Unicode and multibyte characters
   - Malformed markdown
   - Boundary conditions
   - Memory and resource tests
   - Error handling

3. **`integration.test.ts`** - Real-world scenarios
   - Actual Obsidian note formats
   - Different content types (math, code docs, tutorials)
   - Complex entity validation
   - Performance benchmarks

### 🧪 Test Categories

#### Core Functionality (40+ tests)
- ✅ Empty and plain text handling
- ✅ Frontmatter removal (YAML)
- ✅ H1 header removal
- ✅ Bold formatting (`**bold**`, `__bold__`)
- ✅ Italic formatting (`*italic*`, `_italic_`)
- ✅ Code formatting (inline and blocks)
- ✅ Strikethrough (`~~text~~`)
- ✅ Spoilers (`[text]`)
- ✅ Links (`[text](url)`)
- ✅ Headers H2-H6 conversion
- ✅ Blockquotes (regular and expandable)
- ✅ Text truncation and length limits
- ✅ Input validation

#### Edge Cases (30+ tests)
- ✅ Performance with large documents (1000+ lines)
- ✅ Unicode support (emoji, RTL, multibyte)
- ✅ Malformed markdown handling
- ✅ Boundary conditions (start/end formatting)
- ✅ Memory efficiency tests
- ✅ Error handling (null/undefined inputs)
- ✅ Consistency across multiple runs

#### Integration (20+ tests)
- ✅ Real Obsidian note formats
- ✅ Daily notes with tasks and meetings
- ✅ Research notes with citations
- ✅ Tutorials with step-by-step guides
- ✅ Mathematical notation
- ✅ API documentation
- ✅ Complex nested formatting
- ✅ Entity integrity validation

#### Advanced Scenarios (10+ tests)
- ✅ Nested formatting (`**bold with *italic***`)
- ✅ Formatting within blockquotes
- ✅ Code blocks protecting content
- ✅ Multiple entity types in one text
- ✅ Entity position validation
- ✅ Overlapping entity detection

## Running Tests

### Prerequisites

```bash
cd obsidian-kora
npm install
```

### Test Commands

```bash
# Run all tests (from project root)
npm test

# Run with watch mode (auto-rerun on changes)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run only telegram module tests
npm run test:telegram

# Run specific test file
npm run test:telegram -- markdown-to-telegram-converter.test.ts

# Run tests matching pattern
npm run test:telegram -- --grep="blockquote"

# Run tests with verbose output
npm run test:telegram -- --reporter=verbose

# Run comprehensive test suite
node modules/telegram/test-runner.js
```

### Coverage Goals

- **Lines**: 95%+ covered
- **Functions**: 100% covered
- **Branches**: 90%+ covered
- **Statements**: 95%+ covered

## Test Examples

### Basic Formatting Test
```typescript
test('should convert **bold** to entity', () => {
  const result = converter.convert('This is **bold** text');
  expect(result.text).toBe('This is bold text');
  expect(result.entities).toContainEqual({
    type: 'bold',
    offset: 8,
    length: 4
  });
});
```

### Complex Scenario Test
```typescript
test('should handle formatting within blockquotes', () => {
  const result = converter.convert('>[! note]-\n>**Bold** and *italic*');
  expect(result.text).toBe('Bold and italic');
  
  // Should have blockquote + bold + italic entities
  expect(result.entities).toHaveLength(3);
  expect(result.entities).toContainEqual({
    type: 'expandable_blockquote',
    offset: 0,
    length: 15
  });
});
```

### Performance Test
```typescript
test('should handle large documents efficiently', () => {
  const largeContent = Array(1000).fill('**Bold** text').join('\n');
  
  const startTime = Date.now();
  const result = converter.convert(largeContent);
  const endTime = Date.now();
  
  expect(endTime - startTime).toBeLessThan(1000); // Under 1 second
});
```

## Custom Matchers

The test suite includes custom Jest matchers:

```typescript
// Check entity type
expect(entity).toBeEntityType('bold');

// Check entity at specific position
expect(result.entities).toHaveEntityAt(0, 4, 'bold');
```

## Test Data

### Real Obsidian Note Examples
- Daily notes with tasks, meetings, code blocks
- Research notes with citations and quotes
- Tutorials with step-by-step instructions
- Documentation with API examples
- Mathematical notation and formulas

### Edge Case Examples
- Unicode text (emoji, RTL, multibyte)
- Malformed markdown syntax
- Extremely long content
- Nested formatting scenarios
- Empty and whitespace-only content

## Performance Benchmarks

- **Small content** (< 1KB): < 10ms
- **Medium content** (1-10KB): < 50ms  
- **Large content** (10-100KB): < 500ms
- **Very large content** (100KB+): < 2s

## Debugging Tests

### Enable Verbose Logging
```typescript
beforeEach(() => {
  // Don't mock console for debugging
  // jest.spyOn(console, 'log').mockImplementation(() => {});
});
```

### Inspect Entity Positions
```typescript
test('debug entity positions', () => {
  const result = converter.convert('**Bold** *italic*');
  console.log('Text:', JSON.stringify(result.text));
  console.log('Entities:', result.entities);
  
  result.entities.forEach((entity, i) => {
    const text = result.text.substring(entity.offset, entity.offset + entity.length);
    console.log(`Entity ${i}: "${text}" (${entity.type})`);
  });
});
```

## Contributing

When adding new features to `MarkdownToTelegramConverter`:

1. **Add corresponding tests** in the appropriate file
2. **Include edge cases** and error scenarios
3. **Test with real content** examples
4. **Verify entity positions** are correct
5. **Check performance impact** with large inputs
6. **Update this README** if needed

### Test Naming Convention

- Use descriptive test names: `should handle nested formatting within blockquotes`
- Group related tests in `describe` blocks
- Use `test.each` for parameterized tests
- Mark slow tests with appropriate timeouts

### Coverage Requirements

All new code must maintain:
- ✅ 95%+ line coverage
- ✅ 100% function coverage  
- ✅ 90%+ branch coverage
- ✅ Entity position validation
- ✅ Real-world scenario testing
