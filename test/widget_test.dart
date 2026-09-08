// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:wrozo/features/authentication/data/auth_repository.dart';
import 'package:wrozo/main.dart';

void main() {
  testWidgets('WrozoApp mounts and displays initial view', (WidgetTester tester) async {
    // Build our app wrapped in ProviderScope with appUserProvider overridden
    // so tests run hermetically without requiring an active Firebase backend.
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appUserProvider.overrideWith((ref) => Stream.value(null)),
        ],
        child: const WrozoApp(),
      ),
    );

    // Verify that the root application widget mounts successfully.
    expect(find.byType(WrozoApp), findsOneWidget);
  });
}
