import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wrozo/core/notifications/notification_service.dart';

void main() {
  group('NotificationService Unit Tests', () {
    test('notificationServiceProvider resolves NotificationService instance', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final service = container.read(notificationServiceProvider);
      expect(service, isA<NotificationService>());
    });

    test('syncDeviceToken handles empty userId safely without throwing', () async {
      final service = NotificationService();
      // Should return immediately without throwing
      await expectLater(service.syncDeviceToken(''), completes);
    });

    test('removeDeviceToken handles empty userId safely without throwing', () async {
      final service = NotificationService();
      // Should return immediately without throwing
      await expectLater(service.removeDeviceToken(''), completes);
    });

    test('dispose cleans up without throwing', () {
      final service = NotificationService();
      expect(() => service.dispose(), returnsNormally);
    });
  });
}
