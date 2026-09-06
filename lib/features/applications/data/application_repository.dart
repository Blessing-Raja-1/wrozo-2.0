import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/application.dart';

final applicationRepositoryProvider = Provider<ApplicationRepository>((ref) {
  return ApplicationRepository(firestore: FirebaseFirestore.instance);
});

// Stream of applications for a specific job (Contractor view)
final jobApplicationsProvider = StreamProvider.family.autoDispose<List<Application>, String>((ref, jobId) {
  return ref.watch(applicationRepositoryProvider).watchJobApplications(jobId);
});

// Stream of applications for a specific worker
final workerApplicationsProvider = StreamProvider.family.autoDispose<List<Application>, String>((ref, workerId) {
  return ref.watch(applicationRepositoryProvider).watchWorkerApplications(workerId);
});

class ApplicationRepository {
  final FirebaseFirestore _firestore;

  ApplicationRepository({required FirebaseFirestore firestore}) : _firestore = firestore;

  Future<void> applyForJob(Application app) async {
    // Generate a composite ID to prevent multiple applications to the same job
    final docId = '${app.jobId}_${app.workerId}';
    final docRef = _firestore.collection('applications').doc(docId);
    
    final docSnap = await docRef.get();
    if (docSnap.exists) {
      throw Exception("You have already applied for this job.");
    }

    final data = app.toMap();
    data['createdAt'] = FieldValue.serverTimestamp();
    data['updatedAt'] = FieldValue.serverTimestamp();
    await docRef.set(data);
  }

  Future<void> updateApplicationStatus(String applicationId, ApplicationStatus status) async {
    String formatStatus() {
      switch (status) {
        case ApplicationStatus.accepted: return 'ACCEPTED';
        case ApplicationStatus.rejected: return 'REJECTED';
        case ApplicationStatus.withdrawn: return 'WITHDRAWN';
        case ApplicationStatus.pending: return 'PENDING';
      }
    }

    await _firestore.collection('applications').doc(applicationId).update({
      'status': formatStatus(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Stream<List<Application>> watchJobApplications(String jobId) {
    return _firestore
        .collection('applications')
        .where('jobId', isEqualTo: jobId)
        .where('status', isEqualTo: 'PENDING') // Usually just review pending ones
        .orderBy('createdAt', descending: false)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map((doc) => Application.fromMap(doc.id, doc.data())).toList());
  }

  Stream<List<Application>> watchWorkerApplications(String workerId) {
    return _firestore
        .collection('applications')
        .where('workerId', isEqualTo: workerId)
        .orderBy('updatedAt', descending: true)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map((doc) => Application.fromMap(doc.id, doc.data())).toList());
  }
}
