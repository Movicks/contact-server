import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dns from 'dns';

// Force IPv4 DNS resolution first to prevent IPv6 connection timeouts (common in Node 17+)
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Fallback if not supported in older Node
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for your React app
  app.enableCors({
    //origin: 'https://uvo-project.vercel.app', // Your React app URL
    origin: 'https://uvorenewables.com',
    methods: 'POST',
    credentials: true,
  });
  
  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));
  
  await app.listen(4000);
}
bootstrap();