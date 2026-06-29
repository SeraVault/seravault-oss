import * as fs from 'fs';
import * as path from 'path';

/**
 * Email template data interface
 */
export interface EmailTemplateData {
  [key: string]: string | boolean | undefined;
}

/**
 * Load and render an email template
 * Supports simple {{variable}} replacement and {{#if condition}} blocks
 */
export function renderEmailTemplate(
  templateName: string,
  data: EmailTemplateData,
  language: string = 'en'
): string {
  // Try language-specific template first (e.g., invitation-email-fr.html)
  let templatePath = path.join(__dirname, '..', 'templates', `${templateName}-${language}.html`);
  
  // Fallback to base template if language-specific doesn't exist
  if (!fs.existsSync(templatePath)) {
    templatePath = path.join(__dirname, '..', 'templates', `${templateName}.html`);
  }
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Email template not found: ${templateName}`);
  }
  
  let template = fs.readFileSync(templatePath, 'utf-8');
  
  // Handle {{#if condition}} ... {{/if}} blocks
  template = template.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
    return data[condition] ? content : '';
  });
  
  // Replace {{variable}} placeholders
  template = template.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
    const value = data[variable];
    return value !== undefined ? String(value) : match;
  });
  
  return template;
}

/**
 * Get available email templates
 */
export function getAvailableTemplates(): string[] {
  const templatesDir = path.join(__dirname, '..', 'templates');
  
  if (!fs.existsSync(templatesDir)) {
    return [];
  }
  
  return fs.readdirSync(templatesDir)
    .filter(file => file.endsWith('.html'))
    .map(file => file.replace('.html', ''));
}

/**
 * Validate that all required variables are present in data
 */
export function validateTemplateData(
  template: string,
  data: EmailTemplateData
): { valid: boolean; missing: string[] } {
  const variableRegex = /\{\{(\w+)\}\}/g;
  const matches = template.matchAll(variableRegex);
  const missing: string[] = [];
  
  for (const match of matches) {
    const variable = match[1];
    if (data[variable] === undefined) {
      missing.push(variable);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
}
