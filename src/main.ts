import { NestFactory } from '@nestjs/core';
import { AppModule,  } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true }); ;
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    
     const config = new DocumentBuilder()
    .setTitle('Ticket API')
    .setDescription('The Ticket API description')
    .setVersion('0.1')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);

bootstrap();
}