import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/review.dart';

final reviewRepositoryProvider = Provider<ReviewRepository>((ref) {
  return ReviewRepository(firestore: FirebaseFirestore.instance);
});

class ReviewRepository {
  final FirebaseFirestore _firestore;

  ReviewRepository({required FirebaseFirestore firestore}) : _firestore = firestore;

  Future<void> submitReview(Review review) async {
    // Generate a composite ID so a user can only review someone once per job
    final docId = '${review.jobId}_${review.reviewerId}';
    final docRef = _firestore.collection('reviews').doc(docId);
    
    final docSnap = await docRef.get();
    if (docSnap.exists) {
      throw Exception("You have already reviewed this job.");
    }

    final data = review.toMap();
    data['createdAt'] = FieldValue.serverTimestamp();
    
    // Use a batch to write the review and theoretically update the user's aggregate rating
    // Note: In production, aggregate ratings should be done via Cloud Functions to prevent tampering.
    // For MVP, we will just write the review.
    await docRef.set(data);
  }

  Stream<List<Review>> watchUserReviews(String revieweeId) {
    return _firestore
        .collection('reviews')
        .where('revieweeId', isEqualTo: revieweeId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map((doc) => Review.fromMap(doc.id, doc.data())).toList());
  }
}
