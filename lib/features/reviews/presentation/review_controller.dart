import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../authentication/data/auth_repository.dart';
import '../data/review_repository.dart';
import '../domain/review.dart';

final reviewControllerProvider = NotifierProvider.autoDispose<ReviewController, AsyncValue<void>>(() {
  return ReviewController();
});

class ReviewController extends AutoDisposeNotifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() {
    return const AsyncData(null);
  }

  Future<void> submitReview({
    required String jobId,
    required String revieweeId,
    required double rating,
    required String comment,
  }) async {
    final user = ref.read(authStateProvider).value;
    if (user == null) {
      state = AsyncError(Exception("Not authenticated"), StackTrace.current);
      return;
    }

    state = const AsyncLoading();
    try {
      final review = Review(
        id: '',
        jobId: jobId,
        reviewerId: user.uid,
        revieweeId: revieweeId,
        rating: rating,
        comment: comment.trim(),
      );
      
      await ref.read(reviewRepositoryProvider).submitReview(review);
      state = const AsyncData(null);
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }
}
