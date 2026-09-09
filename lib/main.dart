import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:wrozo/core/localization/l10n/app_localizations.dart';
import 'package:wrozo/core/notifications/notification_service.dart';
import 'package:wrozo/core/routing/app_router.dart';
import 'package:wrozo/core/theme/app_theme.dart';
import 'package:wrozo/firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  runApp(
    const ProviderScope(
      child: WrozoApp(),
    ),
  );
}

class WrozoApp extends ConsumerWidget {
  const WrozoApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(goRouterProvider);
    
    return MaterialApp.router(
      title: 'Wrozo',
      onGenerateTitle: (context) => AppLocalizations.of(context)?.appTitle ?? 'Wrozo',
      theme: AppTheme.lightTheme,
      routerConfig: router,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
