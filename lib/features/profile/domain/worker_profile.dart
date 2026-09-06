class WorkerProfile {
  final String uid;
  final String name;
  final List<String> skills;
  final int expectedWage;
  final bool isAvailable;
  final double rating;
  final int reviewCount;
  final int jobsCompleted;

  WorkerProfile({
    required this.uid,
    this.name = '',
    this.skills = const [],
    this.expectedWage = 0,
    this.isAvailable = true,
    this.rating = 0.0,
    this.reviewCount = 0,
    this.jobsCompleted = 0,
  });

  factory WorkerProfile.fromMap(String uid, Map<String, dynamic> data) {
    return WorkerProfile(
      uid: uid,
      name: data['name'] as String? ?? '',
      skills: List<String>.from(data['skills'] ?? []),
      expectedWage: data['expectedWage'] as int? ?? 0,
      isAvailable: data['isAvailable'] as bool? ?? true,
      rating: (data['rating'] as num?)?.toDouble() ?? 0.0,
      reviewCount: data['reviewCount'] as int? ?? 0,
      jobsCompleted: data['jobsCompleted'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'name': name,
      'skills': skills,
      'expectedWage': expectedWage,
      'isAvailable': isAvailable,
      // server-controlled fields (rating, reviewCount, jobsCompleted) 
      // are omitted from client updates
    };
  }
}
