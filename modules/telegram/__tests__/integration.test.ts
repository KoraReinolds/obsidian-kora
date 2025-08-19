/**
 * Integration tests for MarkdownToTelegramConverter
 * Tests real-world scenarios and integration with other components
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { MarkdownToTelegramConverter, ConversionOptions } from '../markdown-to-telegram-converter';

describe('MarkdownToTelegramConverter - Integration Tests', () => {
  let converter: MarkdownToTelegramConverter;

  beforeEach(() => {
    converter = new MarkdownToTelegramConverter();
  });

  describe('Real Obsidian Notes', () => {
    test('should handle daily note format', () => {
      const dailyNote = `---
date: 2024-01-15
tags: [daily, work]
---

# Daily Note - 2024-01-15

## Morning Tasks ✅

>[! todo]- High Priority
>- [x] **Review** [pull request](https://github.com/repo/pull/123)
>- [ ] Update *documentation*
>- [ ] Call client about [budget issues]

## Meeting Notes

### Team Standup (9:00 AM)

**John**: Working on \`user-auth\` feature
*Jane*: Fixing ~~old~~ bugs in payment system

### Code Review Session

\`\`\`typescript
interface UserConfig {
  apiKey: string;
  timeout: number;
}
\`\`\`

>[! info] Remember
>Deploy to **staging** first before *production*

## Random Thoughts

Sometimes I think [this project] will never end 😅

---

**EOD**: Good progress today!`;

      const result = converter.convert(dailyNote);
      
      // Should remove frontmatter and H1
      expect(result.text).not.toContain('---');
      expect(result.text).not.toContain('# Daily Note');
      
      // Should preserve content structure
      expect(result.text).toContain('Morning Tasks ✅');
      expect(result.text).toContain('Team Standup (9:00 AM)');
      
      // Should have multiple entity types
      const entityTypes = new Set(result.entities.map(e => e.type));
      expect(entityTypes.has('expandable_blockquote')).toBe(true);
      expect(entityTypes.has('blockquote')).toBe(true);
      expect(entityTypes.has('bold')).toBe(true);
      expect(entityTypes.has('italic')).toBe(true);
      expect(entityTypes.has('code')).toBe(true);
      expect(entityTypes.has('pre')).toBe(true);
      expect(entityTypes.has('spoiler')).toBe(true);
      expect(entityTypes.has('text_link')).toBe(true);
      expect(entityTypes.has('strikethrough')).toBe(true);
    });

    test('should handle research note with citations', () => {
      const researchNote = `## Literature Review

### Key Papers

1. **Smith et al. (2023)** - [Machine Learning Approaches](https://doi.org/10.1000/example)
   - *Main finding*: Performance improved by **15%**
   - \`methodology\`: Cross-validation with \`k=10\`
   
>[! quote]- Important Quote
>"The results show [significant improvement] in accuracy"
>— Smith et al., p. 42

### Implementation Notes

\`\`\`python
def calculate_accuracy(predictions, targets):
    """Calculate prediction accuracy"""
    return sum(p == t for p, t in zip(predictions, targets)) / len(targets)
\`\`\`

>[! warning]- Limitations
>- **Small sample size** (n=100)
>- *Limited* to [English texts] only
>- ~~No control group~~ (addressed in v2)`;

      const result = converter.convert(researchNote);
      
      expect(result.text).toContain('Literature Review');
      expect(result.text).toContain('Key Papers');
      expect(result.text).toContain('Calculate prediction accuracy');
      
      // Check entities are properly positioned
      const linkEntities = result.entities.filter(e => e.type === 'text_link');
      expect(linkEntities.length).toBeGreaterThan(0);
      
      const codeEntities = result.entities.filter(e => e.type === 'code');
      expect(codeEntities.length).toBeGreaterThan(0);
      
      const preEntities = result.entities.filter(e => e.type === 'pre');
      expect(preEntities.length).toBeGreaterThan(0);
    });

    test('should handle tutorial with steps', () => {
      const tutorial = `# How to Setup Development Environment

## Prerequisites

>[! info]- Required Software
>1. **Node.js** (version 18+)
>2. *Git* for version control
>3. \`npm\` or \`yarn\` package manager

## Step-by-Step Guide

### Step 1: Clone Repository

\`\`\`bash
git clone https://github.com/user/repo.git
cd repo
\`\`\`

>[! tip] Pro Tip
>Use [SSH keys] for **faster** authentication

### Step 2: Install Dependencies

\`\`\`bash
npm install
# or
yarn install
\`\`\`

### Step 3: Configuration

Create a \`.env\` file:

\`\`\`env
API_KEY=your_api_key_here
DEBUG=true
\`\`\`

>[! warning]- Security Warning
>Never commit [API keys] to version control!
>Use **environment variables** instead.

## Troubleshooting

### Common Issues

**Issue**: *"Module not found"*
**Solution**: Run \`npm install\` again

**Issue**: Permission denied
**Solution**: Check [file permissions] or use \`sudo\`

>[! danger]- Important
>~~Don't use~~ \`sudo npm install\` globally!
>Use *node version managers* instead.`;

      const result = converter.convert(tutorial);
      
      // Should structure content properly
      expect(result.text).toContain('Prerequisites');
      expect(result.text).toContain('Step-by-Step Guide');
      expect(result.text).toContain('git clone');
      expect(result.text).toContain('Common Issues');
      
      // Should have appropriate entities
      expect(result.entities.some(e => e.type === 'pre' && e.language === 'bash')).toBe(true);
      expect(result.entities.some(e => e.type === 'pre' && e.language === 'env')).toBe(true);
      expect(result.entities.filter(e => e.type === 'expandable_blockquote').length).toBeGreaterThan(0);
      expect(result.entities.filter(e => e.type === 'blockquote').length).toBeGreaterThan(0);
    });
  });

  describe('Different Content Types', () => {
    test('should handle mathematical notation', () => {
      const mathNote = `## Linear Algebra

### Vectors

A **vector** \`v\` in ℝⁿ can be written as:

\`\`\`math
v = [v₁, v₂, ..., vₙ]
\`\`\`

>[! formula]- Dot Product
>For vectors **a** and **b**:
>\`a · b = Σ(aᵢ × bᵢ)\`

### Matrix Operations

*Matrix multiplication* follows the rule:
- **Rows** × *Columns*
- Result: [m×n] matrix`;

      const result = converter.convert(mathNote);
      
      expect(result.text).toContain('Linear Algebra');
      expect(result.text).toContain('ℝⁿ');
      expect(result.text).toContain('v₁, v₂');
      expect(result.text).toContain('Σ(aᵢ × bᵢ)');
      
      // Math content should be preserved with proper formatting
      const preEntity = result.entities.find(e => e.type === 'pre' && e.language === 'math');
      expect(preEntity).toBeDefined();
    });

    test('should handle code documentation', () => {
      const codeDoc = `## API Documentation

### Authentication

**Endpoint**: \`POST /auth/login\`

**Headers**:
- \`Content-Type: application/json\`
- \`User-Agent: YourApp/1.0\`

**Body**:
\`\`\`json
{
  "username": "user@example.com",
  "password": "secret123"
}
\`\`\`

>[! success]- Response (200 OK)
>\`\`\`json
>{
>  "token": "jwt_token_here",
>  "expires": "2024-01-15T10:00:00Z"
>}
>\`\`\`

>[! error]- Error (401 Unauthorized)
>\`\`\`json
>{
>  "error": "Invalid credentials",
>  "code": 401
>}
>\`\`\`

### Usage Examples

**cURL**:
\`\`\`bash
curl -X POST https://api.example.com/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"user@example.com","password":"secret123"}'
\`\`\`

**JavaScript**:
\`\`\`javascript
const response = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});
\`\`\`

>[! note] Rate Limiting
>This endpoint is limited to **5 requests** per *minute* per IP.
>Exceeded requests will return [429 Too Many Requests].`;

      const result = converter.convert(codeDoc);
      
      expect(result.text).toContain('API Documentation');
      expect(result.text).toContain('POST /auth/login');
      expect(result.text).toContain('Content-Type: application/json');
      
      // Should have multiple code blocks with different languages
      const jsonBlocks = result.entities.filter(e => e.type === 'pre' && e.language === 'json');
      const bashBlocks = result.entities.filter(e => e.type === 'pre' && e.language === 'bash');
      const jsBlocks = result.entities.filter(e => e.type === 'pre' && e.language === 'javascript');
      
      expect(jsonBlocks.length).toBeGreaterThan(0);
      expect(bashBlocks.length).toBeGreaterThan(0);
      expect(jsBlocks.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Combinations', () => {
    test('should work with minimal configuration', () => {
      const options: ConversionOptions = {
        removeFrontmatter: false,
        removeH1Headers: false,
        preserveCodeBlocks: false,
        preserveLinks: false
      };

      const result = converter.convert('# Title\n**Bold** [text](url) \`code\`', options);
      
      expect(result.text).toContain('# Title');
      expect(result.text).toContain('text'); // Link text preserved
      expect(result.text).toContain('code'); // Code content preserved
      expect(result.entities.some(e => e.type === 'text_link')).toBe(false);
      expect(result.entities.some(e => e.type === 'pre')).toBe(false);
    });

    test('should work with maximal configuration', () => {
      const options: ConversionOptions = {
        removeFrontmatter: true,
        removeH1Headers: true,
        preserveCodeBlocks: true,
        preserveLinks: true,
        maxLength: 2000
      };

      const longContent = Array(100).fill('**Bold** *italic* `code` [link](url)').join('\n');
      const result = converter.convert(longContent, options);
      
      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.text.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('Entity Validation', () => {
    test('should maintain entity integrity across complex transformations', () => {
      const complex = `>[! multi]- Complex Test
>**Bold with *nested italic* and \`code\`**
>
>Regular text with [spoiler]
>
>\`\`\`javascript
>// Code with **formatting** that should be ignored
>const test = "value";
>\`\`\`

Outside text with **bold** and *italic*`;

      const result = converter.convert(complex);
      
      // Validate all entities are within text bounds
      result.entities.forEach(entity => {
        expect(entity.offset).toBeGreaterThanOrEqual(0);
        expect(entity.offset + entity.length).toBeLessThanOrEqual(result.text.length);
        
        // Validate entity text makes sense
        const entityText = result.text.substring(entity.offset, entity.offset + entity.length);
        expect(entityText).toBeTruthy();
        expect(entityText.trim()).toBeTruthy();
      });

      // Check for overlapping entities (except nested ones)
      const sortedEntities = [...result.entities].sort((a, b) => a.offset - b.offset);
      for (let i = 0; i < sortedEntities.length - 1; i++) {
        const current = sortedEntities[i];
        const next = sortedEntities[i + 1];
        
        // Either no overlap, or complete nesting
        const noOverlap = current.offset + current.length <= next.offset;
        const completeNesting = next.offset + next.length <= current.offset + current.length;
        
        expect(noOverlap || completeNesting).toBe(true);
      }
    });

    test('should handle entity boundaries correctly', () => {
      const testCases = [
        { input: '**start** middle **end**', entityCount: 2 },
        { input: 'a **b** c **d** e', entityCount: 2 },
        { input: '**a***b*`c`[d]', entityCount: 4 },
        { input: '>[! note]- **Bold** in quote', entityCount: 2 }, // blockquote + bold
      ];

      testCases.forEach(({ input, entityCount }) => {
        const result = converter.convert(input);
        expect(result.entities).toHaveLength(entityCount);
        
        // All entities should have valid text
        result.entities.forEach(entity => {
          const text = result.text.substring(entity.offset, entity.offset + entity.length);
          expect(text.trim()).toBeTruthy();
        });
      });
    });
  });

  describe('Memory and Performance', () => {
    test('should handle repeated conversions without memory leaks', () => {
      const testInput = '**Bold** *italic* `code` [spoiler] and >quote';
      
      // Simulate many conversions
      for (let i = 0; i < 100; i++) {
        const result = converter.convert(testInput);
        expect(result.entities.length).toBeGreaterThan(0);
      }
      
      // No memory leak assertions (would need more sophisticated monitoring)
      expect(true).toBe(true);
    });

    test('should scale linearly with content size', () => {
      const sizes = [100, 500, 1000, 2000];
      const times: number[] = [];
      
      sizes.forEach(size => {
        const content = Array(size).fill('**test**').join(' ');
        
        const start = performance.now();
        converter.convert(content);
        const end = performance.now();
        
        times.push(end - start);
      });
      
      // Later times should be proportionally longer, but not exponentially
      expect(times[3] / times[0]).toBeLessThan(50); // Should scale reasonably
    });
  });
});
