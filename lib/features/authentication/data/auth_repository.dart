import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/app_user.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    auth: FirebaseAuth.instance,
    firestore: FirebaseFirestore.instance,
  );
});

// Provides a stream of the current FirebaseAuth user
final authStateProvider = StreamProvider<User?>((ref) {
  return ref.watch(authRepositoryProvider).authStateChanges();
});

// Provides a stream of the custom AppUser document from Firestore
final appUserProvider = StreamProvider<AppUser?>((ref) {
  final authUser = ref.watch(authStateProvider).value;
  if (authUser == null) return Stream.value(null);
  return ref.watch(authRepositoryProvider).appUserChanges(authUser.uid);
});

class AuthRepository {
  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;

  AuthRepository({
    required FirebaseAuth auth,
    required FirebaseFirestore firestore,
  })  : _auth = auth,
        _firestore = firestore;

  Stream<User?> authStateChanges() => _auth.authStateChanges();

  Stream<AppUser?> appUserChanges(String uid) {
    return _firestore.collection('users').doc(uid).snapshots().map((doc) {
      if (doc.exists) {
        return AppUser.fromFirestore(doc);
      }
      return null;
    });
  }

  Future<void> verifyPhone({
    required String phoneNumber,
    required Function(String verificationId) codeSent,
    required Function(FirebaseAuthException e) verificationFailed,
  }) async {
    await _auth.verifyPhoneNumber(
      phoneNumber: phoneNumber,
      verificationCompleted: (PhoneAuthCredential credential) async {
        // Automatic resolution (e.g. Android SMS auto-retrieval)
        await _signInWithCredential(credential);
      },
      verificationFailed: verificationFailed,
      codeSent: (String verificationId, int? resendToken) {
        codeSent(verificationId);
      },
      codeAutoRetrievalTimeout: (String verificationId) {},
    );
  }

  Future<void> verifyOTP(String verificationId, String smsCode) async {
    PhoneAuthCredential credential = PhoneAuthProvider.credential(
      verificationId: verificationId,
      smsCode: smsCode,
    );
    await _signInWithCredential(credential);
  }

  Future<void> _signInWithCredential(PhoneAuthCredential credential) async {
    final userCredential = await _auth.signInWithCredential(credential);
    final user = userCredential.user;
    
    // Ensure Firestore user record exists
    if (user != null) {
      final docRef = _firestore.collection('users').doc(user.uid);
      final docSnap = await docRef.get();
      if (!docSnap.exists) {
        await docRef.set({
          'phone': user.phoneNumber,
          'status': 'ACTIVE',
          'createdAt': FieldValue.serverTimestamp(),
        });
      }
    }
  }

  // SEC-01: Permitted role values. Changing this list does NOT override Firestore rules.
  // The authoritative allowlist enforcement is in firestore.rules (isAllowedRole function).
  static const _allowedRoles = {'WORKER', 'CONTRACTOR'};

  Future<void> setRole(String role) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception("Not authenticated");

    // Defence-in-depth: reject disallowed roles before touching Firestore.
    // ADMIN and any other privileged value are explicitly blocked here and enforced
    // again by firestore.rules on the server side.
    if (!_allowedRoles.contains(role)) {
      throw Exception('Invalid role: only WORKER or CONTRACTOR are permitted.');
    }

    await _firestore.collection('users').doc(user.uid).update({
      'role': role,
    });

    // Create respective profile doc with server-controlled fields at zero values.
    // firestore.rules enforces these starting values on create (SEC-03).
    if (role == 'WORKER') {
      await _firestore.collection('worker_profiles').doc(user.uid).set({
        'rating': 0,
        'reviewCount': 0,
        'jobsCompleted': 0,
        'createdAt': FieldValue.serverTimestamp(),
      });
    } else if (role == 'CONTRACTOR') {
      await _firestore.collection('contractor_profiles').doc(user.uid).set({
        'rating': 0,
        'reviewCount': 0,
        'isVerified': false,
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
  }

  /// Authoritative account onboarding for Worker, Contractor, or Both.
  /// Dual-role users gain both capabilities under a single Firebase account and UID.
  Future<void> setupCapabilities({
    required bool worker,
    required bool contractor,
    String? activeMode,
  }) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception("Not authenticated");

    if (!worker && !contractor) {
      throw ArgumentError("At least one capability must be selected.");
    }

    final mode = activeMode ?? (worker ? 'WORKER' : 'CONTRACTOR');

    // For single-role selections, maintain full backwards compatibility with legacy role
    final String legacyRole = (worker && contractor)
        ? 'WORKER'
        : (worker ? 'WORKER' : 'CONTRACTOR');

    // Update user document with activeMode and legacy role
    await _firestore.collection('users').doc(user.uid).update({
      'role': legacyRole,
      'activeMode': mode,
    });

    // Create required initial profiles with server-controlled zero metrics (SEC-03)
    if (worker) {
      final workerDoc = await _firestore.collection('worker_profiles').doc(user.uid).get();
      if (!workerDoc.exists) {
        await _firestore.collection('worker_profiles').doc(user.uid).set({
          'rating': 0,
          'reviewCount': 0,
          'jobsCompleted': 0,
          'createdAt': FieldValue.serverTimestamp(),
        });
      }
    }

    if (contractor) {
      final contractorDoc = await _firestore.collection('contractor_profiles').doc(user.uid).get();
      if (!contractorDoc.exists) {
        await _firestore.collection('contractor_profiles').doc(user.uid).set({
          'rating': 0,
          'reviewCount': 0,
          'isVerified': false,
          'createdAt': FieldValue.serverTimestamp(),
        });
      }
    }
  }

  /// Switches user's current presentation mode between WORKER and CONTRACTOR.
  /// This operation:
  /// - Does NOT change authorization capabilities
  /// - Does NOT change Firebase UID
  /// - Does NOT delete profiles
  /// - Does NOT alter job history, applications, payments, or chat identity
  Future<void> switchActiveMode(String newMode) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception("Not authenticated");

    if (newMode != 'WORKER' && newMode != 'CONTRACTOR') {
      throw ArgumentError("Invalid mode: only WORKER or CONTRACTOR permitted.");
    }

    await _firestore.collection('users').doc(user.uid).update({
      'activeMode': newMode,
    });
  }

  Future<void> signOut() async {
    await _auth.signOut();
  }
}
