# BARBERAGENT NestJS Backend Architecture

## Project Structure

```
backend/
├── src/
│   ├── main.ts                          # Application entry point
│   ├── app.module.ts                    # Root module
│   ├── config/
│   │   ├── database.config.ts           # Supabase configuration
│   │   ├── websocket.config.ts          # Socket.io configuration
│   │   ├── whatsapp.config.ts           # WhatsApp Cloud API config
│   │   └── ai.config.ts                 # DeepSeek AI config
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── tenant.decorator.ts      # @Tenant() decorator
│   │   │   ├── user.decorator.ts        # @User() decorator
│   │   │   └── auth.decorator.ts        # @Auth() decorator
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts # Global exception handling
│   │   ├── guards/
│   │   │   ├── auth.guard.ts            # JWT authentication
│   │   │   └── tenant.guard.ts          # Tenant isolation
│   │   ├── interceptors/
│   │   │   ├── logging.interceptor.ts   # Request logging
│   │   │   └── transform.interceptor.ts # Response transformation
│   │   └── middleware/
│   │       └── correlation-id.middleware.ts # Correlation ID tracking
│   ├── database/
│   │   ├── supabase.service.ts          # Supabase client
│   │   └── supabase.module.ts           # Database module
│   ├── events/
│   │   ├── event-bus.service.ts         # Central event dispatcher
│   │   ├── event-emitter.service.ts     # Event emission
│   │   └── events.module.ts             # Events module
│   ├── modules/
│   │   ├── appointments/
│   │   │   ├── appointments.controller.ts
│   │   │   ├── appointments.service.ts
│   │   │   ├── appointments.module.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-appointment.dto.ts
│   │   │   │   ├── update-appointment.dto.ts
│   │   │   │   └── appointment-response.dto.ts
│   │   │   └── entities/
│   │   │       └── appointment.entity.ts
│   │   ├── whatsapp/
│   │   │   ├── whatsapp.controller.ts
│   │   │   ├── whatsapp.service.ts
│   │   │   ├── whatsapp.module.ts
│   │   │   ├── dto/
│   │   │   │   ├── webhook-message.dto.ts
│   │   │   │   └── send-message.dto.ts
│   │   │   └── strategies/
│   │   │       └── message-parser.strategy.ts
│   │   ├── conversations/
│   │   │   ├── conversations.controller.ts
│   │   │   ├── conversations.service.ts
│   │   │   ├── conversations.module.ts
│   │   │   ├── dto/
│   │   │   │   └── conversation.dto.ts
│   │   │   └── fsm/
│   │   │       ├── conversation.fsm.ts
│   │   │       └── fsm-states.ts
│   │   ├── ai-orchestrator/
│   │   │   ├── ai-orchestrator.service.ts
│   │   │   ├── ai-orchestrator.module.ts
│   │   │   ├── dto/
│   │   │   │   └── ai-intent.dto.ts
│   │   │   └── strategies/
│   │   │       ├── intent-detector.strategy.ts
│   │   │       ├── slot-validator.strategy.ts
│   │   │       └── response-generator.strategy.ts
│   │   ├── realtime/
│   │   │   ├── realtime.gateway.ts
│   │   │   ├── realtime.service.ts
│   │   │   ├── realtime.module.ts
│   │   │   └── dto/
│   │   │       └── realtime-event.dto.ts
│   │   ├── clients/
│   │   │   ├── clients.controller.ts
│   │   │   ├── clients.service.ts
│   │   │   └── clients.module.ts
│   │   ├── barbers/
│   │   │   ├── barbers.controller.ts
│   │   │   ├── barbers.service.ts
│   │   │   └── barbers.module.ts
│   │   ├── services/
│   │   │   ├── services.controller.ts
│   │   │   ├── services.service.ts
│   │   │   └── services.module.ts
│   │   └── auth/
│   │       ├── auth.controller.ts
│   │       ├── auth.service.ts
│   │       └── auth.module.ts
│   └── utils/
│       ├── logger.ts
│       ├── error-handler.ts
│       └── validators.ts
├── test/
├── .env.example
├── .env.local
├── package.json
├── tsconfig.json
└── nest-cli.json
```

---

## Core Modules

### 1. Appointments Module

**appointments.controller.ts**
```typescript
import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto';
import { AuthGuard } from '@/common/guards/auth.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { Tenant } from '@/common/decorators/tenant.decorator';
import { User } from '@/common/decorators/user.decorator';

@Controller('appointments')
@UseGuards(AuthGuard, TenantGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  async create(
    @Body() createAppointmentDto: CreateAppointmentDto,
    @Tenant() tenantId: string,
    @User() userId: string,
  ) {
    return this.appointmentsService.create(
      tenantId,
      userId,
      createAppointmentDto,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Tenant() tenantId: string) {
    return this.appointmentsService.findOne(tenantId, id);
  }

  @Get('barber/:barberId/date/:date')
  async findByBarberAndDate(
    @Param('barberId') barberId: string,
    @Param('date') date: string,
    @Tenant() tenantId: string,
  ) {
    return this.appointmentsService.findByBarberAndDate(
      tenantId,
      barberId,
      new Date(date),
    );
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateAppointmentDto: UpdateAppointmentDto,
    @Tenant() tenantId: string,
    @User() userId: string,
  ) {
    return this.appointmentsService.update(
      tenantId,
      id,
      userId,
      updateAppointmentDto,
    );
  }

  @Delete(':id')
  async cancel(
    @Param('id') id: string,
    @Tenant() tenantId: string,
    @User() userId: string,
  ) {
    return this.appointmentsService.cancel(tenantId, id, userId);
  }

  @Get('available-slots/:barberId')
  async getAvailableSlots(
    @Param('barberId') barberId: string,
    @Tenant() tenantId: string,
  ) {
    return this.appointmentsService.getAvailableSlots(tenantId, barberId);
  }
}
```

**appointments.service.ts**
```typescript
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '@/database/supabase.service';
import { EventEmitterService } from '@/events/event-emitter.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventEmitter: EventEmitterService,
  ) {}

  async create(
    tenantId: string,
    userId: string,
    dto: CreateAppointmentDto,
  ) {
    // 1. Validate conflict
    const conflicts = await this.checkConflicts(
      tenantId,
      dto.barberId,
      dto.scheduledAt,
      dto.durationMinutes,
    );

    if (conflicts.length > 0) {
      throw new ConflictException('Appointment conflicts detected');
    }

    // 2. Acquire slot lock
    const lockId = await this.acquireSlotLock(
      tenantId,
      dto.barberId,
      dto.scheduledAt,
    );

    try {
      // 3. Create appointment
      const appointmentId = uuidv4();
      const { data, error } = await this.supabaseService
        .getClient()
        .from('appointments')
        .insert({
          id: appointmentId,
          tenant_id: tenantId,
          client_id: dto.clientId,
          barber_id: dto.barberId,
          service_id: dto.serviceId,
          source: dto.source || 'dashboard',
          status: 'scheduled',
          scheduled_at: dto.scheduledAt,
          duration_minutes: dto.durationMinutes,
          notes: dto.notes,
          price: dto.price,
        })
        .select()
        .single();

      if (error) throw error;

      // 4. Emit event
      await this.eventEmitter.emit('appointment.created', {
        appointmentId,
        tenantId,
        userId,
        data,
      });

      return data;
    } finally {
      // 5. Release lock
      await this.releaseSlotLock(lockId);
    }
  }

  async update(
    tenantId: string,
    appointmentId: string,
    userId: string,
    dto: UpdateAppointmentDto,
  ) {
    const appointment = await this.findOne(tenantId, appointmentId);
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update(dto)
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;

    await this.eventEmitter.emit('appointment.updated', {
      appointmentId,
      tenantId,
      userId,
      changes: dto,
    });

    return data;
  }

  async cancel(tenantId: string, appointmentId: string, userId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;

    await this.eventEmitter.emit('appointment.cancelled', {
      appointmentId,
      tenantId,
      userId,
    });

    return data;
  }

  async findOne(tenantId: string, appointmentId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointment_details')
      .select('*')
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) throw error;
    return data;
  }

  async findByBarberAndDate(
    tenantId: string,
    barberId: string,
    date: Date,
  ) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('barber_id', barberId)
      .gte('scheduled_at', date.toISOString())
      .lt('scheduled_at', new Date(date.getTime() + 86400000).toISOString())
      .order('scheduled_at', { ascending: true });

    if (error) throw error;
    return data;
  }

  async getAvailableSlots(tenantId: string, barberId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .rpc('get_available_slots', {
        p_barber_id: barberId,
        p_date: new Date().toISOString().split('T')[0],
        p_duration_minutes: 45,
      });

    if (error) throw error;
    return data;
  }

  private async checkConflicts(
    tenantId: string,
    barberId: string,
    scheduledAt: Date,
    durationMinutes: number,
  ) {
    const endTime = new Date(scheduledAt.getTime() + durationMinutes * 60000);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('barber_id', barberId)
      .lt('scheduled_at', endTime.toISOString())
      .gt('scheduled_at', new Date(scheduledAt.getTime() - 45 * 60000).toISOString())
      .in('status', ['scheduled', 'confirmed']);

    if (error) throw error;
    return data || [];
  }

  private async acquireSlotLock(
    tenantId: string,
    barberId: string,
    slotTime: Date,
  ): Promise<string> {
    const lockId = uuidv4();
    const expiresAt = new Date(Date.now() + 30000); // 30 second TTL

    const { error } = await this.supabaseService
      .getClient()
      .from('slot_locks')
      .insert({
        id: lockId,
        tenant_id: tenantId,
        barber_id: barberId,
        slot_time: slotTime.toISOString(),
        lock_owner: 'system',
        expires_at: expiresAt.toISOString(),
      });

    if (error) throw error;
    return lockId;
  }

  private async releaseSlotLock(lockId: string) {
    await this.supabaseService
      .getClient()
      .from('slot_locks')
      .delete()
      .eq('id', lockId);
  }
}
```

### 2. WhatsApp Module

**whatsapp.controller.ts**
```typescript
import { Controller, Post, Body, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { WhatsappService } from './whatsapp.service';
import { WebhookMessageDto } from './dto/webhook-message.dto';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('webhook')
  async handleWebhook(
    @Body() body: any,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    // Webhook verification
    if (verifyToken === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    // Process incoming message
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            await this.whatsappService.handleIncomingMessage(
              change.value,
            );
          }
        }
      }
    }

    res.status(200).send('ok');
  }
}
```

**whatsapp.service.ts**
```typescript
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '@/database/supabase.service';
import { EventEmitterService } from '@/events/event-emitter.service';
import { AIOrchestrationService } from '@/modules/ai-orchestrator/ai-orchestrator.service';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  private readonly whatsappApiUrl = 'https://graph.instagram.com/v18.0';
  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  private readonly accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventEmitter: EventEmitterService,
    private readonly aiOrchestrator: AIOrchestrationService,
  ) {}

  async handleIncomingMessage(messageData: any) {
    const message = messageData.messages[0];
    const contact = messageData.contacts[0];
    const tenantId = process.env.TENANT_ID; // Should come from config

    // 1. Find or create client
    let client = await this.findClientByWhatsApp(tenantId, contact.wa_id);

    if (!client) {
      client = await this.createClientFromWhatsApp(tenantId, contact);
    }

    // 2. Find or create conversation
    let conversation = await this.findConversation(
      tenantId,
      client.id,
      message.from,
    );

    if (!conversation) {
      conversation = await this.createConversation(
        tenantId,
        client.id,
        message.from,
      );
    }

    // 3. Save message
    const savedMessage = await this.saveMessage(
      tenantId,
      conversation.id,
      'client',
      message.text.body,
      message.id,
    );

    // 4. Emit event
    await this.eventEmitter.emit('message.received', {
      messageId: savedMessage.id,
      conversationId: conversation.id,
      clientId: client.id,
      tenantId,
    });

    // 5. Process with AI
    const aiResponse = await this.aiOrchestrator.processMessage(
      tenantId,
      conversation.id,
      client.id,
      message.text.body,
    );

    // 6. Send response
    if (aiResponse.shouldRespond) {
      await this.sendMessage(
        contact.wa_id,
        aiResponse.message,
      );

      // Save AI response
      await this.saveMessage(
        tenantId,
        conversation.id,
        'ai',
        aiResponse.message,
      );
    }

    // 7. Create appointment if detected
    if (aiResponse.appointmentData) {
      // Delegate to appointments service
      await this.eventEmitter.emit('appointment.ai_requested', {
        conversationId: conversation.id,
        clientId: client.id,
        appointmentData: aiResponse.appointmentData,
        tenantId,
      });
    }
  }

  async sendMessage(phoneNumber: string, message: string) {
    try {
      await axios.post(
        `${this.whatsappApiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'text',
          text: { body: message },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        },
      );
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
      throw error;
    }
  }

  private async findClientByWhatsApp(tenantId: string, waId: string) {
    const { data } = await this.supabaseService
      .getClient()
      .from('clients')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('whatsapp_id', waId)
      .single();

    return data;
  }

  private async createClientFromWhatsApp(tenantId: string, contact: any) {
    const { data } = await this.supabaseService
      .getClient()
      .from('clients')
      .insert({
        tenant_id: tenantId,
        phone: contact.wa_id,
        whatsapp_id: contact.wa_id,
        name: contact.profile.name,
      })
      .select()
      .single();

    return data;
  }

  private async findConversation(
    tenantId: string,
    clientId: string,
    waId: string,
  ) {
    const { data } = await this.supabaseService
      .getClient()
      .from('conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .eq('whatsapp_conversation_id', waId)
      .single();

    return data;
  }

  private async createConversation(
    tenantId: string,
    clientId: string,
    waId: string,
  ) {
    const { data } = await this.supabaseService
      .getClient()
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        whatsapp_conversation_id: waId,
        status: 'active',
      })
      .select()
      .single();

    return data;
  }

  private async saveMessage(
    tenantId: string,
    conversationId: string,
    senderType: string,
    content: string,
    whatsappMessageId?: string,
  ) {
    const { data } = await this.supabaseService
      .getClient()
      .from('messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        sender_type: senderType,
        content,
        message_type: 'text',
        whatsapp_message_id: whatsappMessageId,
        status: 'sent',
      })
      .select()
      .single();

    return data;
  }
}
```

### 3. AI Orchestrator Module

**ai-orchestrator.service.ts**
```typescript
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '@/database/supabase.service';
import { EventEmitterService } from '@/events/event-emitter.service';
import axios from 'axios';

@Injectable()
export class AIOrchestrationService {
  private readonly deepseekApiUrl = 'https://api.deepseek.com/v1/chat/completions';
  private readonly deepseekApiKey = process.env.DEEPSEEK_API_KEY;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventEmitter: EventEmitterService,
  ) {}

  async processMessage(
    tenantId: string,
    conversationId: string,
    clientId: string,
    message: string,
  ) {
    // 1. Detect intent
    const intent = await this.detectIntent(message);

    // 2. Extract entities
    const entities = await this.extractEntities(message, intent);

    // 3. Generate response
    let response = await this.generateResponse(intent, entities);

    // 4. If scheduling intent, validate and create appointment
    let appointmentData = null;
    if (intent === 'schedule_appointment') {
      const validation = await this.validateSchedulingData(
        tenantId,
        entities,
      );

      if (validation.isValid) {
        appointmentData = validation.appointmentData;
        response = `Perfecto, he agendado tu cita para ${entities.date} a las ${entities.time} con ${entities.barberName}. Tu confirmación es #${appointmentData.id}`;
      } else {
        response = `No pude agendar la cita. ${validation.error}`;
      }
    }

    return {
      intent,
      entities,
      message: response,
      shouldRespond: true,
      appointmentData,
    };
  }

  private async detectIntent(message: string): Promise<string> {
    const response = await axios.post(
      this.deepseekApiUrl,
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `You are a barbershop appointment assistant. Detect the intent of the user message. 
            Respond with ONLY one of these intents: schedule_appointment, cancel_appointment, check_appointment, general_inquiry.`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.3,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.deepseekApiKey}`,
        },
      },
    );

    return response.data.choices[0].message.content.trim();
  }

  private async extractEntities(message: string, intent: string) {
    const response = await axios.post(
      this.deepseekApiUrl,
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `Extract scheduling information from the message. Return JSON with: date, time, service, barber_preference.
            If not mentioned, use null. Be strict with date/time parsing.`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.3,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.deepseekApiKey}`,
        },
      },
    );

    try {
      return JSON.parse(response.data.choices[0].message.content);
    } catch {
      return {};
    }
  }

  private async generateResponse(intent: string, entities: any): Promise<string> {
    const response = await axios.post(
      this.deepseekApiUrl,
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `You are a friendly barbershop assistant. Generate a natural response in Spanish.
            Keep it short and helpful. If scheduling, confirm the details.`,
          },
          {
            role: 'user',
            content: `Intent: ${intent}, Entities: ${JSON.stringify(entities)}`,
          },
        ],
        temperature: 0.7,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.deepseekApiKey}`,
        },
      },
    );

    return response.data.choices[0].message.content;
  }

  private async validateSchedulingData(tenantId: string, entities: any) {
    // Validate date/time
    if (!entities.date || !entities.time) {
      return {
        isValid: false,
        error: 'No pude entender la fecha y hora. Por favor intenta de nuevo.',
      };
    }

    // Find available slots
    const slots = await this.findAvailableSlots(tenantId, entities);

    if (slots.length === 0) {
      return {
        isValid: false,
        error: 'No hay disponibilidad en ese horario. Intenta con otro.',
      };
    }

    return {
      isValid: true,
      appointmentData: {
        id: `APT-${Date.now()}`,
        ...entities,
      },
    };
  }

  private async findAvailableSlots(tenantId: string, entities: any) {
    // Query available slots from database
    const { data } = await this.supabaseService
      .getClient()
      .rpc('get_available_slots', {
        p_barber_id: entities.barber_id,
        p_date: entities.date,
        p_duration_minutes: 45,
      });

    return data || [];
  }
}
```

### 4. Realtime Gateway (Socket.io)

**realtime.gateway.ts**
```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';
import { EventEmitterService } from '@/events/event-emitter.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly eventEmitter: EventEmitterService,
  ) {
    // Subscribe to all events
    this.eventEmitter.on('appointment.created', (data) => {
      this.broadcastToTenant(data.tenantId, 'appointment:created', data);
    });

    this.eventEmitter.on('appointment.updated', (data) => {
      this.broadcastToTenant(data.tenantId, 'appointment:updated', data);
    });

    this.eventEmitter.on('message.received', (data) => {
      this.broadcastToTenant(data.tenantId, 'message:received', data);
    });

    this.eventEmitter.on('calendar.updated', (data) => {
      this.broadcastToTenant(data.tenantId, 'calendar:updated', data);
    });
  }

  handleConnection(client: Socket) {
    const tenantId = client.handshake.auth.tenantId;
    const userId = client.handshake.auth.userId;

    client.join(`tenant:${tenantId}`);
    client.join(`user:${userId}`);

    this.realtimeService.recordUserPresence(tenantId, userId, 'online');
    this.broadcastToTenant(tenantId, 'presence:updated', {
      userId,
      status: 'online',
    });
  }

  handleDisconnect(client: Socket) {
    const tenantId = client.handshake.auth.tenantId;
    const userId = client.handshake.auth.userId;

    this.realtimeService.recordUserPresence(tenantId, userId, 'offline');
    this.broadcastToTenant(tenantId, 'presence:updated', {
      userId,
      status: 'offline',
    });
  }

  @SubscribeMessage('appointment:create')
  async handleCreateAppointment(client: Socket, data: any) {
    const tenantId = client.handshake.auth.tenantId;
    const userId = client.handshake.auth.userId;

    // Emit to backend service
    this.eventEmitter.emit('appointment.websocket_create', {
      ...data,
      tenantId,
      userId,
    });
  }

  @SubscribeMessage('calendar:sync')
  async handleCalendarSync(client: Socket, data: any) {
    const tenantId = client.handshake.auth.tenantId;

    const appointments = await this.realtimeService.getAppointments(
      tenantId,
      data.date,
    );

    client.emit('calendar:synced', appointments);
  }

  private broadcastToTenant(tenantId: string, event: string, data: any) {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }
}
```

---

## Environment Variables

```env
# Database
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# WhatsApp
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_VERIFY_TOKEN=your-verify-token

# AI
DEEPSEEK_API_KEY=your-deepseek-api-key

# WebSocket
WEBSOCKET_URL=ws://localhost:3001

# Frontend
FRONTEND_URL=http://localhost:3000

# Tenant
TENANT_ID=default-tenant-id

# Redis
REDIS_URL=redis://localhost:6379
```

---

## Installation & Setup

```bash
# Create NestJS project
nest new barberagent-backend

# Install dependencies
npm install @nestjs/websockets @nestjs/socket.io
npm install @supabase/supabase-js
npm install axios
npm install uuid
npm install dotenv

# Run migrations (create tables in Supabase)
npm run migrate

# Start development server
npm run start:dev

# Start production
npm run start:prod
```

---

## Key Patterns

**Event-Driven:** All state changes emit events through EventBus.

**Transactional:** Appointments use slot locking for conflict prevention.

**Real-Time:** Socket.io gateway broadcasts changes to connected clients.

**Multi-Tenant:** All queries filtered by tenant_id.

**Error Handling:** Global exception filter with correlation IDs.

**Logging:** Structured logging with correlation tracking.

