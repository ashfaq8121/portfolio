# TESTING.md

## Automated Tests
Tests are written with Vitest. Run with:
```bash
npm run test
```

### What is tested
- Contact form validation — name, email, message rules
- Rate limiting — blocks after 5 submissions from same IP
- RSS utility functions — sort by date, escape XML characters
- Edge cases — empty fields, wrong method, server errors

## Manual Testing

### Browsers tested
- Chrome — Windows
- Edge — Windows

### Screen sizes tested
- 1920px desktop
- 1366px laptop
- 768px tablet
- 390px mobile
- 320px small mobile

### Pages checked
- Home — loads correctly, links work
- About — text and sidebar display correctly
- Projects — cards show correctly
- Blog — post list and individual posts load
- Contact — form validates and shows success or error message
- 404 — shows on unknown URLs
- Dark mode — toggle works and saves preference

### Accessibility
- Keyboard navigation works on all pages
- Skip to content link works
- All images have alt text
- Color contrast is readable

## Known Issues
- Contact form email only works on the deployed Cloudflare site, not on local dev server
- Blog uses hardcoded data so adding new posts requires editing the source code