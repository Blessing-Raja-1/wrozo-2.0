import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:wrozo/features/applications/data/application_repository.dart';
import 'package:wrozo/features/applications/domain/application.dart';
import 'package:wrozo/features/authentication/data/auth_repository.dart';
import 'package:wrozo/features/authentication/domain/app_user.dart';
import 'package:wrozo/features/authentication/presentation/screens/role_selection_screen.dart';
import 'package:wrozo/features/home/presentation/screens/home_screen.dart';
import 'package:wrozo/features/jobs/data/job_repository.dart';
import 'package:wrozo/features/jobs/domain/job.dart';

void main() {
  group('Dual-Role & Capabilities Domain Model', () {
    test('worker-only account resolves worker capability and defaults to WORKER mode', () {
      final worker = AppUser(
        uid: 'user_worker_1',
        phone: '+919876543210',
        capabilities: const UserCapabilities(worker: true, contractor: false),
        activeMode: 'WORKER',
      );

      expect(worker.hasWorkerCapability, isTrue);
      expect(worker.hasContractorCapability, isFalse);
      expect(worker.isDualRole, isFalse);
      expect(worker.hasSetupRoles, isTrue);
      expect(worker.currentActiveMode, equals('WORKER'));
      expect(worker.uid, equals('user_worker_1'));
    });

    test('contractor-only account resolves contractor capability and defaults to CONTRACTOR mode', () {
      final contractor = AppUser(
        uid: 'user_contractor_1',
        phone: '+919876543211',
        capabilities: const UserCapabilities(worker: false, contractor: true),
        activeMode: 'CONTRACTOR',
      );

      expect(contractor.hasWorkerCapability, isFalse);
      expect(contractor.hasContractorCapability, isTrue);
      expect(contractor.isDualRole, isFalse);
      expect(contractor.hasSetupRoles, isTrue);
      expect(contractor.currentActiveMode, equals('CONTRACTOR'));
      expect(contractor.uid, equals('user_contractor_1'));
    });

    test('legacy single-role user without capabilities map falls back cleanly', () {
      final legacyWorker = AppUser(
        uid: 'legacy_w1',
        phone: '+919876543212',
        role: 'WORKER',
      );
      expect(legacyWorker.hasWorkerCapability, isTrue);
      expect(legacyWorker.hasContractorCapability, isFalse);
      expect(legacyWorker.currentActiveMode, equals('WORKER'));

      final legacyContractor = AppUser(
        uid: 'legacy_c1',
        phone: '+919876543213',
        role: 'CONTRACTOR',
      );
      expect(legacyContractor.hasWorkerCapability, isFalse);
      expect(legacyContractor.hasContractorCapability, isTrue);
      expect(legacyContractor.currentActiveMode, equals('CONTRACTOR'));
    });

    test('dual-role account possesses both capabilities with single UID', () {
      final dualUser = AppUser(
        uid: 'user_dual_1',
        phone: '+919876543214',
        capabilities: const UserCapabilities(worker: true, contractor: true),
        activeMode: 'WORKER',
      );

      expect(dualUser.hasWorkerCapability, isTrue);
      expect(dualUser.hasContractorCapability, isTrue);
      expect(dualUser.isDualRole, isTrue);
      expect(dualUser.hasSetupRoles, isTrue);
      expect(dualUser.currentActiveMode, equals('WORKER'));
      expect(dualUser.uid, equals('user_dual_1'));
    });

    test('switching activeMode retains UID, capabilities, and presentation state', () {
      final userMode1 = AppUser(
        uid: 'dual_uid_99',
        phone: '+919876543215',
        capabilities: const UserCapabilities(worker: true, contractor: true),
        activeMode: 'WORKER',
      );
      expect(userMode1.currentActiveMode, equals('WORKER'));

      // Switch mode to CONTRACTOR
      final userMode2 = AppUser(
        uid: userMode1.uid,
        phone: userMode1.phone,
        capabilities: userMode1.capabilities,
        activeMode: 'CONTRACTOR',
      );

      expect(userMode2.uid, equals(userMode1.uid), reason: 'UID must be identical across mode switches');
      expect(userMode2.hasWorkerCapability, isTrue);
      expect(userMode2.hasContractorCapability, isTrue);
      expect(userMode2.currentActiveMode, equals('CONTRACTOR'));
    });

    test('activeMode change cannot grant unauthorized capabilities', () {
      // Single-role worker attempting to pretend to be in CONTRACTOR mode
      final sneakyWorker = AppUser(
        uid: 'worker_sneak',
        phone: '+919876543216',
        capabilities: const UserCapabilities(worker: true, contractor: false),
        activeMode: 'CONTRACTOR',
      );

      // Model ensures contractor capability remains false and mode falls back safely
      expect(sneakyWorker.hasContractorCapability, isFalse);
      expect(sneakyWorker.currentActiveMode, equals('WORKER'));
    });
  });

  group('Dual-Role Dashboard & UI Switching Tests', () {
    testWidgets('Dual-role user in WORKER mode displays Worker Dashboard and mode switcher', (tester) async {
      final dualUserWorkerMode = AppUser(
        uid: 'dual_user_test',
        phone: '+919876543299',
        capabilities: const UserCapabilities(worker: true, contractor: true),
        activeMode: 'WORKER',
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appUserProvider.overrideWith((ref) => Stream.value(dualUserWorkerMode)),
            workerApplicationsProvider.overrideWith((ref, workerId) => Stream.value(<Application>[])),
            contractorJobsProvider.overrideWith((ref, contractorId) => Stream.value(<Job>[])),
          ],
          child: const MaterialApp(
            home: HomeScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Worker Dashboard'), findsOneWidget);
      expect(find.text('Welcome, Worker!'), findsOneWidget);
      expect(find.text('Find Nearby Jobs'), findsOneWidget);
      expect(find.text('Active: Worker'), findsOneWidget);
      expect(find.text('Switch to Contractor'), findsOneWidget);
    });

    testWidgets('Dual-role user in CONTRACTOR mode displays Contractor Dashboard and mode switcher', (tester) async {
      final dualUserContractorMode = AppUser(
        uid: 'dual_user_test',
        phone: '+919876543299',
        capabilities: const UserCapabilities(worker: true, contractor: true),
        activeMode: 'CONTRACTOR',
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appUserProvider.overrideWith((ref) => Stream.value(dualUserContractorMode)),
            workerApplicationsProvider.overrideWith((ref, workerId) => Stream.value(<Application>[])),
            contractorJobsProvider.overrideWith((ref, contractorId) => Stream.value(<Job>[])),
          ],
          child: const MaterialApp(
            home: HomeScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Contractor Dashboard'), findsOneWidget);
      expect(find.text('Welcome, Contractor!'), findsOneWidget);
      expect(find.text('Post a New Job'), findsOneWidget);
      expect(find.text('Active: Contractor'), findsOneWidget);
      expect(find.text('Switch to Worker'), findsOneWidget);
    });

    testWidgets('Single-role account does NOT display dual-role mode switcher', (tester) async {
      final singleWorker = AppUser(
        uid: 'single_w1',
        phone: '+919876543200',
        capabilities: const UserCapabilities(worker: true, contractor: false),
        activeMode: 'WORKER',
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appUserProvider.overrideWith((ref) => Stream.value(singleWorker)),
            workerApplicationsProvider.overrideWith((ref, workerId) => Stream.value(<Application>[])),
            contractorJobsProvider.overrideWith((ref, contractorId) => Stream.value(<Job>[])),
          ],
          child: const MaterialApp(
            home: HomeScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Worker Dashboard'), findsOneWidget);
      expect(find.text('Switch to Contractor'), findsNothing);
      expect(find.text('Active: Worker'), findsNothing);
    });

    testWidgets('RoleSelectionScreen presents Worker, Contractor, and Both options', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: RoleSelectionScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('I am a Worker'), findsOneWidget);
      expect(find.text('I am a Contractor'), findsOneWidget);
      expect(find.text('I want to do Both'), findsOneWidget);
      expect(find.text('Continue'), findsOneWidget);
    });
  });
}
