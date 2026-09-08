import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wrozo/core/localization/l10n/app_localizations.dart';
import 'package:wrozo/core/localization/l10n/app_localizations_en.dart';
import 'package:wrozo/core/localization/l10n/app_localizations_hi.dart';
import 'package:wrozo/core/localization/l10n/app_localizations_mr.dart';
import 'package:wrozo/core/localization/l10n/app_localizations_ta.dart';
import 'package:wrozo/core/localization/l10n/app_localizations_te.dart';
import 'package:wrozo/features/authentication/data/auth_repository.dart';
import 'package:wrozo/main.dart';

void main() {
  group('AppLocalizations Unit Tests', () {
    test('supportedLocales contains all 5 required languages', () {
      final languageCodes =
          AppLocalizations.supportedLocales.map((l) => l.languageCode).toSet();
      expect(languageCodes, containsAll(['en', 'hi', 'ta', 'te', 'mr']));
      expect(languageCodes.length, equals(5));
    });

    test('lookupAppLocalizations resolves each locale to correct subclass', () {
      expect(lookupAppLocalizations(const Locale('en')), isA<AppLocalizationsEn>());
      expect(lookupAppLocalizations(const Locale('hi')), isA<AppLocalizationsHi>());
      expect(lookupAppLocalizations(const Locale('ta')), isA<AppLocalizationsTa>());
      expect(lookupAppLocalizations(const Locale('te')), isA<AppLocalizationsTe>());
      expect(lookupAppLocalizations(const Locale('mr')), isA<AppLocalizationsMr>());
    });

    test('all 5 locales provide complete, non-empty marketplace strings', () {
      for (final locale in AppLocalizations.supportedLocales) {
        final l10n = lookupAppLocalizations(locale);
        expect(l10n.appTitle, equals('Wrozo'), reason: 'Locale ${locale.languageCode} appTitle');
        expect(l10n.worker.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} worker');
        expect(l10n.contractor.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} contractor');
        expect(l10n.login.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} login');
        expect(l10n.phoneNumber.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} phoneNumber');
        expect(l10n.sendOtp.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} sendOtp');
        expect(l10n.verifyOtp.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} verifyOtp');
        expect(l10n.findNearbyJobs.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} findNearbyJobs');
        expect(l10n.postJob.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} postJob');
        expect(l10n.myProfile.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} myProfile');
        expect(l10n.companyProfile.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} companyProfile');
        expect(l10n.messages.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} messages');
        expect(l10n.myApplications.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} myApplications');
        expect(l10n.myPostedJobs.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} myPostedJobs');
        expect(l10n.reviewApplicants.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} reviewApplicants');
        expect(l10n.wage.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} wage');
        expect(l10n.perDay.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} perDay');
        expect(l10n.apply.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} apply');
        expect(l10n.signOut.trim().isNotEmpty, isTrue, reason: 'Locale ${locale.languageCode} signOut');
      }
    });

    test('unsupported locale throws FlutterError in lookupAppLocalizations', () {
      expect(
        () => lookupAppLocalizations(const Locale('fr')),
        throwsA(isA<FlutterError>()),
      );
    });
  });

  group('AppLocalizations Widget Integration Tests', () {
    for (final locale in AppLocalizations.supportedLocales) {
      testWidgets('Localizations widget resolves ${locale.languageCode} in context',
          (WidgetTester tester) async {
        late AppLocalizations resolved;

        await tester.pumpWidget(
          MaterialApp(
            locale: locale,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: Builder(
              builder: (context) {
                resolved = AppLocalizations.of(context)!;
                return Scaffold(
                  body: Text(resolved.findNearbyJobs),
                );
              },
            ),
          ),
        );

        expect(resolved.localeName, equals(locale.languageCode));
        expect(find.text(resolved.findNearbyJobs), findsOneWidget);
      });
    }

    testWidgets('WrozoApp boots cleanly with registered localizations delegates',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appUserProvider.overrideWith((ref) => Stream.value(null)),
          ],
          child: const WrozoApp(),
        ),
      );

      expect(find.byType(WrozoApp), findsOneWidget);
    });
  });
}
