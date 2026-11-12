import { Global, Module } from '@nestjs/common';
import {
  MockMessageProvider, NOTIFICATION_PROVIDER, NotificationProvider, OTP_SENDER, OtpSender, UnconfiguredMessagingProvider, mockMessagingAllowed,
} from './message-provider';
import { ZaloZnsProvider, readZaloZnsConfig } from './zalo-zns.provider';

/** Picks the provider from env at startup. Real adapters (Zalo ZNS / SMS) are added here by their own factory functions. */
export function createMessagingProviders(env: NodeJS.ProcessEnv = process.env): { otp: OtpSender; notifications: NotificationProvider } {
  if (mockMessagingAllowed(env)) {
    const mock = new MockMessageProvider();
    return { otp: mock, notifications: mock };
  }
  // MESSAGING_PROVIDER=zalo_zns + ZALO_ACCESS_TOKEN (+ approved template ids). UNVERIFIED against the official Zalo docs; never sent a real message.
  if (env.MESSAGING_PROVIDER === 'zalo_zns') {
    const config = readZaloZnsConfig(env);
    if (config) {
      const zalo = new ZaloZnsProvider(config);
      return { otp: zalo, notifications: zalo };
    }
  }
  const none = new UnconfiguredMessagingProvider();
  return { otp: none, notifications: none };
}

/** Created once at startup. Exported so in-process tests can read the MockMessageProvider outbox; not reachable over HTTP. */
export const messagingProviders = createMessagingProviders();
const providers = messagingProviders;

@Global()
@Module({
  providers: [
    { provide: OTP_SENDER, useValue: providers.otp },
    { provide: NOTIFICATION_PROVIDER, useValue: providers.notifications },
  ],
  exports: [OTP_SENDER, NOTIFICATION_PROVIDER],
})
export class MessagingModule {}
