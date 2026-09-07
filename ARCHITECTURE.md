# Architecture Documentation

## Project Title
Hills of Glory International Christian Center Inc. Website and Admin CMS

## 1. System Overview

The system consists of a static client frontend built with standard web technologies and a serverless backend powered by Supabase.

```text
+-----------------------------------------------------------------------+
|                            BROWSER CLIENT                             |
|                                                                       |
|  [ Public Web Pages ]                        [ Admin CMS Dashboard ]  |
|  (HTML5, SCSS, jQuery, Tabler)               (HTML5, SCSS, jQuery)    |
+-----------------------------------+-----------------------------------+
                                    |
                                    | JavaScript API Client
                                    v
+-----------------------------------------------------------------------+
|                          SUPABASE BACKEND                             |
|                                                                       |
|  +--------------------+  +--------------------+  +-----------------+  |
|  | PostgreSQL Database|  |  Authentication    |  |  Storage        |  |
|  | (Data and RLS)     |  |  (Email/Password)  |  |  (Bucket)       |  |
|  +--------------------+  +--------------------+  +-----------------+  |
+-----------------------------------------------------------------------+
```

## 2. Directory Structure

/
├── index.html                  # Home page 
├── about.html                  # Mission, vision, statement of belief, dynamic leadership team 
├── ministries.html             # Worship Team, Ministries, Campus Ministries, & Join Form 
├── sermons.html                # Sermons list and media player 
├── events.html                 # Church events calendar 
├── lifegroups.html             # Bible study groups directory 
├── locations.html              # Main campus, outreaches (daughter churches), and dynamic schedules 
├── give.html                   # Tithes and giving options populated from church settings 
├── contact.html                # Contact info and prayer request form 
│
├── images/                     # Local folder for hardcoded, static design assets and poster fallbacks
├── videos/                     # Local folder for static video assets
│
├── admin/                      # Secure Admin CMS
│   ├── login.html              # Admin authentication login page 
│   ├── dashboard.html          # Main CMS control panel 
│   └── js/
│       ├── admin-auth.js       # Session verification and login logic
│       └── admin-cms.js        # CRUD operations (leadership, ministries, settings, etc.)
│
├── scss/                       # SCSS source code
│   ├── main.scss               # Main stylesheet entry point
│   ├── _variables.scss         # CSS custom properties for Light/Dark mode, fonts, spring curves
│   ├── _animations.scss        # Emil Kowalski-inspired keyframes and premium micro-interactions
│   ├── _base.scss              # Resets, typography, global utilities
│   ├── _components.scss        # Cards, buttons, modals, forms, glassmorphic UI elements
│   ├── _layout.scss            # Header, navigation, footer, grid, background blurs
│   └── _admin.scss             # Admin CMS specific layout and forms
│
├── css/
│   └── main.css                # Compiled output CSS
│
└── js/
    ├── supabase-client.js      # Supabase client initialization
    └── main.js                 # Public site scripts (jQuery, UI behaviors, Dark Mode toggle)
```