# FeedFamily Launch Checklist

## Version 1.0.0 - Initial Release

---

## ✅ Completed

- [x] Core functionality (browse, save, plan, shop)
- [x] Swipe discovery with category filters
- [x] AI recipe import (photo, video, text)
- [x] Creator profiles and subscriptions
- [x] Google Sign-In
- [x] Guest mode with limited access
- [x] Account deletion (GDPR/CCPA)
- [x] Privacy Policy page
- [x] Terms of Service page
- [x] Version management system
- [x] Row Level Security on all tables
- [x] Secure API key handling

---

## 🔴 Blocking (Must Fix Before Launch)

### Apple App Store

- [ ] **Sign in with Apple** - Required when offering Google Sign-In
  - Add `expo-apple-authentication` package
  - Configure in Apple Developer Console
  - Add to login screen

- [ ] **App Store Connect Setup**
  - [ ] Create app in App Store Connect
  - [ ] Fill out App Privacy questionnaire
  - [ ] Add Privacy Policy URL
  - [ ] Set age rating (4+)
  - [ ] Export compliance (HTTPS only = exempt)

- [ ] **Screenshots**
  - [ ] iPhone 6.7" (1290 x 2796)
  - [ ] iPhone 6.5" (1284 x 2778)
  - [ ] iPhone 5.5" (1242 x 2208)
  - [ ] iPad Pro 12.9" (2048 x 2732)

- [ ] **App Icon** - Verify all sizes exist
  - [ ] 1024x1024 for App Store
  - [ ] Check `assets/icon.png`

### Google Play Store

- [ ] **Play Console Setup**
  - [ ] Create app in Play Console
  - [ ] Fill out Data Safety form
  - [ ] Add Privacy Policy URL
  - [ ] Complete content rating questionnaire
  - [ ] Set up signing key

- [ ] **Screenshots**
  - [ ] Phone (1080 x 1920 minimum)
  - [ ] 7" Tablet (optional)
  - [ ] 10" Tablet (optional)

- [ ] **Feature Graphic** (1024 x 500)

### Supabase Production

- [ ] **Google OAuth**
  - [ ] Create Google Cloud project
  - [ ] Configure OAuth consent screen
  - [ ] Add Client ID/Secret to Supabase
  - [ ] Add redirect URLs

- [ ] **Environment**
  - [ ] Verify production Supabase URL
  - [ ] Check all API keys are production keys
  - [ ] Test all migrations on production DB

---

## 🟡 Recommended (Before or Shortly After Launch)

### Security

- [ ] Add Sentry for error tracking
- [ ] Implement rate limiting on AI calls
- [ ] Add input sanitization for AI prompts
- [ ] Consider certificate pinning

### Analytics (Optional)

- [ ] Add analytics with user consent
- [ ] Track key events (sign up, recipe save, etc.)

### Performance

- [ ] Test on low-end devices
- [ ] Optimize image loading
- [ ] Add offline mode handling

### Testing

- [ ] Manual QA on iOS device
- [ ] Manual QA on Android device
- [ ] Test all auth flows
- [ ] Test guest mode restrictions
- [ ] Test AI import with various images

---

## 📝 App Store Metadata

### App Name
FeedFamily

### Subtitle (iOS, 30 chars)
Family Meal Planning Made Easy

### Short Description (Android, 80 chars)
Discover recipes, plan meals, and shop smarter for your family.

### Full Description
```
FeedFamily makes family meal planning effortless. Discover delicious recipes from top creators, plan your weekly meals, and generate smart shopping lists automatically.

FEATURES:
• Swipe to discover recipes tailored to your dietary preferences
• Import recipes from photos, videos, or text using AI
• Smart shopping lists grouped by store aisle
• Weekly meal planning with drag-and-drop
• Family portion calculator based on age and dietary needs
• Follow your favorite recipe creators
• Save favorites and build your recipe collection

Whether you're cooking for picky eaters, managing dietary restrictions, or just looking for dinner inspiration, FeedFamily has you covered.

Download now and transform the way your family eats!
```

### Keywords (iOS, 100 chars)
recipes,meal planning,family meals,cooking,shopping list,dinner ideas,healthy eating,food

### Category
- Primary: Food & Drink
- Secondary: Health & Fitness

---

## 🚀 Release Commands

```bash
# 1. Update version in lib/version.ts
# 2. Update version in app.json
# 3. Build for production

# iOS
npx eas build --platform ios --profile production

# Android
npx eas build --platform android --profile production

# Submit to stores
npx eas submit --platform ios
npx eas submit --platform android
```

---

## 📅 Post-Launch

- [ ] Monitor crash reports
- [ ] Respond to user reviews
- [ ] Track key metrics
- [ ] Plan v1.1 features
