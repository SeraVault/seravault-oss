# Email Templates

This directory contains HTML email templates used by SeraVault Cloud Functions.

## Available Templates

### `invitation-email.html`
Used when sending invitation emails to new users.

**Variables:**
- `{{fromUserDisplayName}}` - Name of the person sending the invitation
- `{{fromUserEmail}}` - Email of the person sending the invitation
- `{{inviteLink}}` - Direct link to signup page with invitation ID
- `{{message}}` - Optional personal message from sender
- `{{hasMessage}}` - Boolean flag for conditional message display

**When triggered:** Automatically when a document is created in the `userInvitations` Firestore collection.

## Template Syntax

### Variables
Use `{{variableName}}` to insert dynamic content:
```html
<p>Hello {{userName}}!</p>
```

### Conditional Blocks
Use `{{#if condition}}...{{/if}}` for conditional content:
```html
{{#if hasMessage}}
  <div class="message">{{message}}</div>
{{/if}}
```

**Note:** The condition variable must be a boolean. Use a separate variable like `hasMessage` instead of checking `{{#if message}}`.

## Editing Templates

1. **Edit the HTML file** directly in this directory
2. **Test locally** with Firebase Emulator:
   ```bash
   firebase emulators:start
   ```
3. **Deploy** to production:
   ```bash
   cd functions
   npm run build
   cd ..
   firebase deploy --only functions
   ```

## Styling Guidelines

### Inline CSS
Email clients have limited CSS support. Follow these best practices:

✅ **DO:**
- Use inline styles when possible
- Use `<style>` tags in `<head>` for media queries
- Use tables for complex layouts (if needed)
- Test in multiple email clients

❌ **DON'T:**
- Use external CSS files
- Use advanced CSS (flexbox, grid)
- Use JavaScript
- Use background images (unreliable)

### Responsive Design
Include mobile-friendly styles in `<style>` tag:
```css
@media only screen and (max-width: 600px) {
  .container {
    margin: 0 10px;
  }
}
```

### Color Scheme
SeraVault brand colors:
- Primary: `#00bf5f` (green gradient start)
- Secondary: `#00ff7f` (bright green gradient end)
- Success: `#4caf50`
- Warning: `#ffa726`
- Text: `#333` (dark gray)
- Muted: `#666` (medium gray)
- Light backgrounds: `#f0fff8` (light green tint)
- Logo container: `#1a1a1a` (dark background for logo visibility)


## Creating New Templates

1. **Create a new `.html` file** in this directory:
   ```
   functions/templates/your-template-name.html
   ```

2. **Use the template system** in your Cloud Function:
   ```typescript
   import {renderEmailTemplate} from "./emailTemplates";
   
   const html = renderEmailTemplate('your-template-name', {
     variableName: 'value',
     anotherVariable: 'another value',
   });
   ```

3. **Follow the structure** of existing templates for consistency

## Template Structure

All templates should follow this basic structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Title</title>
  <style>
    /* Your styles here */
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <h1>Your Heading</h1>
      </div>

      <!-- Content -->
      <div class="content">
        <!-- Your content here -->
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>Footer content</p>
      </div>
    </div>
  </div>
</body>
</html>
```

## Testing

### Local Testing
1. Start Firebase Emulator
2. Trigger the email action in your app
3. Check emulator logs for email content
4. Copy/paste HTML into an email tester like [Litmus](https://litmus.com/) or [Email on Acid](https://www.emailonacid.com/)

### Email Client Testing
Test in these common clients:
- Gmail (web, mobile)
- Outlook (desktop, web)
- Apple Mail (macOS, iOS)
- Yahoo Mail
- Thunderbird

### Online Tools
- [Litmus](https://litmus.com/) - Email testing service
- [Email on Acid](https://www.emailonacid.com/) - Email testing
- [HTML Email Check](https://www.htmlemailcheck.com/check/) - Free validator
- [Can I Email](https://www.caniemail.com/) - CSS/HTML support matrix

## Troubleshooting

### Template not found
Error: `Email template not found: template-name`

**Solution:** Ensure the template file exists at `functions/templates/template-name.html` and rebuild:
```bash
cd functions
npm run build
```

### Variables not replacing
Variables showing as `{{variableName}}` in email?

**Solution:** 
1. Check variable name matches in template and code
2. Ensure value is passed in the data object
3. Rebuild and redeploy functions

### Styling not working
**Solution:** 
1. Use inline styles for critical styling
2. Keep CSS simple (tables, basic properties)
3. Test in actual email clients, not browsers
4. Avoid advanced CSS features

## Future Templates

Consider creating templates for:
- **Welcome email** - When user first signs up
- **Password reset** - Forgot password flow
- **File shared notification** - When someone shares a file
- **Contact request** - When someone sends a contact request
- **Security alert** - Suspicious activity detected
- **Storage limit warning** - Approaching storage quota
- **Feature announcement** - New features released

## Resources

- [Email Design Best Practices](https://www.campaignmonitor.com/resources/guides/email-design/)
- [HTML Email Development](https://www.smashingmagazine.com/2021/04/complete-guide-html-email-templates-tools/)
- [Responsive Email Design](https://www.litmus.com/blog/the-how-to-guide-to-responsive-email-design-infographic/)
- [Can I Email](https://www.caniemail.com/) - CSS/HTML support
