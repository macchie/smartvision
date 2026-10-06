import { ApplicationConfig, APP_INITIALIZER, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { ConfirmationService, MessageService } from 'primeng/api';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { AuthService } from './core/services/auth.service';
import { UserConfigService } from './core/services/user-config.service';

import { routes } from './app.routes';

const THEME_COLOR = 'blue';

const MyPreset = definePreset(Aura, {
    semantic: {
      primary: {
        50: `{${THEME_COLOR}.50}`,
        100: `{${THEME_COLOR}.100}`,
        200: `{${THEME_COLOR}.200}`,
        300: `{${THEME_COLOR}.300}`,
        400: `{${THEME_COLOR}.400}`,
        500: `{${THEME_COLOR}.500}`,
        600: `{${THEME_COLOR}.600}`,
        700: `{${THEME_COLOR}.700}`,
        800: `{${THEME_COLOR}.800}`,
        900: `{${THEME_COLOR}.900}`,
        950: `{${THEME_COLOR}.950}`
      },
      colorScheme: {
        light: {
          
        }
      }
    }
});

function initializeApp(auth: AuthService, userConfig: UserConfigService) {
  return async () => {
    await auth.init();
    // Load per-user preferences (language/theme) once auth state is known.
    // A mismatching stored language triggers a reload inside load().
    if (auth.isAuthenticated()) {
      await userConfig.load();
    }
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimationsAsync(),
    MessageService,
    ConfirmationService,
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      deps: [AuthService, UserConfigService],
      multi: true,
    },
    providePrimeNG({
      theme: {
        preset: MyPreset,
        options: {
          darkModeSelector: '.dark'
        }
      }
    })
  ]
};
