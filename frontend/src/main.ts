import 'zone.js';

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(() =>
    import('@vercel/speed-insights').then(({ injectSpeedInsights }) => injectSpeedInsights()),
  )
  .catch((err) => console.error(err));
