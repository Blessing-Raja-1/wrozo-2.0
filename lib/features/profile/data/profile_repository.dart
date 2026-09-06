import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/worker_profile.dart';
import '../domain/contractor_profile.dart';
import '../../authentication/data/auth_repository.dart';

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(firestore: FirebaseFirestore.instance);
});

final workerProfileProvider = StreamProvider.autoDispose<WorkerProfile?>((ref) {
  final authUser = ref.watch(authStateProvider).value;
  if (authUser == null) return Stream.value(null);
  return ref.watch(profileRepositoryProvider).workerProfileChanges(authUser.uid);
});

final contractorProfileProvider = StreamProvider.autoDispose<ContractorProfile?>((ref) {
  final authUser = ref.watch(authStateProvider).value;
  if (authUser == null) return Stream.value(null);
  return ref.watch(profileRepositoryProvider).contractorProfileChanges(authUser.uid);
});

class ProfileRepository {
  final FirebaseFirestore _firestore;

  ProfileRepository({required FirebaseFirestore firestore}) : _firestore = firestore;

  Stream<WorkerProfile?> workerProfileChanges(String uid) {
    return _firestore.collection('worker_profiles').doc(uid).snapshots().map((doc) {
      if (doc.exists) return WorkerProfile.fromMap(doc.id, doc.data()!);
      return null;
    });
  }

  Stream<ContractorProfile?> contractorProfileChanges(String uid) {
    return _firestore.collection('contractor_profiles').doc(uid).snapshots().map((doc) {
      if (doc.exists) return ContractorProfile.fromMap(doc.id, doc.data()!);
      return null;
    });
  }

  Future<void> updateWorkerProfile(String uid, Map<String, dynamic> data) async {
    await _firestore.collection('worker_profiles').doc(uid).set(
      data,
      SetOptions(merge: true),
    );
  }

  Future<void> updateContractorProfile(String uid, Map<String, dynamic> data) async {
    await _firestore.collection('contractor_profiles').doc(uid).set(
      data,
      SetOptions(merge: true),
    );
  }
}
