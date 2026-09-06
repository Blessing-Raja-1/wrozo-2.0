class ContractorProfile {
  final String uid;
  final String name;
  final String companyName;
  final bool isVerified;
  final double rating;
  final int reviewCount;

  ContractorProfile({
    required this.uid,
    this.name = '',
    this.companyName = '',
    this.isVerified = false,
    this.rating = 0.0,
    this.reviewCount = 0,
  });

  factory ContractorProfile.fromMap(String uid, Map<String, dynamic> data) {
    return ContractorProfile(
      uid: uid,
      name: data['name'] as String? ?? '',
      companyName: data['companyName'] as String? ?? '',
      isVerified: data['isVerified'] as bool? ?? false,
      rating: (data['rating'] as num?)?.toDouble() ?? 0.0,
      reviewCount: data['reviewCount'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'name': name,
      'companyName': companyName,
      // server-controlled fields are omitted from client updates
    };
  }
}
