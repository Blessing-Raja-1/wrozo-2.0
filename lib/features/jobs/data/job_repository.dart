import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geoflutterfire_plus/geoflutterfire_plus.dart';
import '../domain/job.dart';

final jobRepositoryProvider = Provider<JobRepository>((ref) {
  return JobRepository(firestore: FirebaseFirestore.instance);
});

// Stream of open jobs for workers (legacy, unused in production now)
final openJobsProvider = StreamProvider.autoDispose<List<Job>>((ref) {
  return ref.watch(jobRepositoryProvider).watchOpenJobs();
});

// Stream of jobs for a specific contractor
final contractorJobsProvider = StreamProvider.family.autoDispose<List<Job>, String>((ref, contractorId) {
  return ref.watch(jobRepositoryProvider).watchContractorJobs(contractorId);
});

// Stream of nearby jobs
final nearbyJobsProvider = StreamProvider.family.autoDispose<List<Job>, GeoFirePoint>((ref, center) {
  return ref.watch(jobRepositoryProvider).watchNearbyJobs(center, 50.0); // 50km radius
});

class JobRepository {
  final FirebaseFirestore _firestore;

  JobRepository({required FirebaseFirestore firestore}) : _firestore = firestore;

  Future<void> createJob(Job job) async {
    final docRef = _firestore.collection('jobs').doc();
    final data = job.toMap();
    data['createdAt'] = FieldValue.serverTimestamp();
    await docRef.set(data);
  }

  Stream<List<Job>> watchOpenJobs() {
    return _firestore
        .collection('jobs')
        .where('status', isEqualTo: 'OPEN')
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map((doc) => Job.fromMap(doc.id, doc.data())).toList());
  }

  Stream<List<Job>> watchNearbyJobs(GeoFirePoint center, double radiusInKm) {
    final collectionReference = _firestore.collection('jobs');
    return GeoCollectionReference<Map<String, dynamic>>(collectionReference)
        .subscribeWithin(
          center: center,
          radiusInKm: radiusInKm,
          field: 'geohash',
          geopointFrom: (data) => (data['location'] as GeoPoint?) ?? const GeoPoint(0, 0),
          queryBuilder: (query) => query.where('status', isEqualTo: 'OPEN'),
        )
        .map((snapshots) => snapshots
            .map((doc) => Job.fromMap(doc.id, doc.data() ?? {}))
            .toList());
  }

  Stream<List<Job>> watchContractorJobs(String contractorId) {
    return _firestore
        .collection('jobs')
        .where('contractorId', isEqualTo: contractorId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map((doc) => Job.fromMap(doc.id, doc.data())).toList());
  }
}

