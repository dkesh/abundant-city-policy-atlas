/**
 * Scoring Engine for Report Cards
 * Ports SQL scoring logic to JavaScript for easier customization
 */

/**
 * Calculate limitations penalty for a reform
 * @param {Object} reform - Reform object with scope, land_use, requirements arrays
 * @returns {number} Penalty points (0-30 max per reform)
 */
function calculateReformLimitationsPenalty(reform) {
  let penalty = 0;
  
  // Scope limitations: 5 points if not citywide
  if (reform.scope && Array.isArray(reform.scope) && reform.scope.length > 0) {
    const hasCitywide = reform.scope.some(s => 
      s && s.toLowerCase() === 'citywide'
    );
    if (!hasCitywide) {
      penalty += 5;
    }
  }
  
  // Land use limitations: 5 points if not "all uses"
  if (reform.land_use && Array.isArray(reform.land_use) && reform.land_use.length > 0) {
    const hasAllUses = reform.land_use.some(lu => 
      lu && lu.toLowerCase() === 'all uses'
    );
    if (!hasAllUses) {
      penalty += 5;
    }
  }
  
  // Requirements limitations: 10 points if not "by right"
  if (reform.requirements && Array.isArray(reform.requirements) && reform.requirements.length > 0) {
    const hasByRight = reform.requirements.some(req => 
      req && req.toLowerCase() === 'by right'
    );
    if (!hasByRight) {
      penalty += 10;
    }
  }
  
  return Math.min(penalty, 30); // Cap at 30 points
}

/**
 * Custom scoring for Parking category
 * Full credit for parking:eliminated, partial credit for parking:reduced
 */
function calculateParkingScore(reforms, categoryReformTypes) {
  const reformCodes = new Set(reforms.map(r => r.reform_code));
  
  // Check for eliminated (full credit)
  const hasEliminated = reformCodes.has('parking:eliminated');
  
  // Check for reduced (partial credit)
  const hasReduced = reformCodes.has('parking:reduced') || 
                     reformCodes.has('parking:reduced_minimum');
  
  if (hasEliminated) {
    // Full credit if eliminated
    return 100;
  } else if (hasReduced) {
    // Partial credit (e.g., 50%) if only reduced
    return 50;
  }
  
  // Default: count unique reform types
  const adoptedCount = new Set(reforms.map(r => r.reform_type_id)).size;
  return (adoptedCount / categoryReformTypes.length) * 100;
}

/**
 * Custom scoring for Housing Typology category
 * ADUs are worth 1/3 of the score, Plexes are worth 2/3 of the score
 */
function calculateHousingTypologyScore(reforms, categoryReformTypes) {
  const reformCodes = new Set(reforms.map(r => r.reform_code));
  
  const hasADU = reformCodes.has('housing:adu');
  const hasPlex = reformCodes.has('housing:plex');
  
  let score = 0;
  
  if (hasADU) {
    score += 33.33; // 1/3 of 100
  }
  
  if (hasPlex) {
    score += 66.67; // 2/3 of 100
  }
  
  return Math.min(100, score);
}

/**
 * Custom scoring for Zoning Category
 * RICZ is worth 45%, YIGBY is worth 10%, TOD Upzones is worth 45%
 */
function calculateZoningCategoryScore(reforms, categoryReformTypes) {
  const reformCodes = new Set(reforms.map(r => r.reform_code));
  
  const hasRICZ = reformCodes.has('zoning:ricz');
  const hasYIGBY = reformCodes.has('zoning:yigby');
  const hasTOD = reformCodes.has('zoning:tod');
  
  let score = 0;
  
  if (hasRICZ) {
    score += 45;
  }
  
  if (hasYIGBY) {
    score += 10;
  }
  
  if (hasTOD) {
    score += 45;
  }
  
  return Math.min(100, score);
}

/**
 * Custom scoring for Other category
 * Land Value Tax is worth 100% of the score
 */
function calculateOtherScore(reforms, categoryReformTypes) {
  const reformCodes = new Set(reforms.map(r => r.reform_code));
  
  const hasLandValueTax = reformCodes.has('other:land_value_tax');
  
  if (hasLandValueTax) {
    return 100;
  }
  
  // Default: count unique reform types
  const adoptedCount = new Set(reforms.map(r => r.reform_type_id)).size;
  return (adoptedCount / categoryReformTypes.length) * 100;
}

/**
 * Calculate category score with custom rules
 * @param {string} category - Category name (e.g., "Parking", "Housing Types")
 * @param {Array} reforms - Array of reform objects for this category
 * @param {Array} allReformTypes - All available reform types
 * @returns {Object} Score object with baseScore, limitationsPenalty, finalScore, letterGrade
 */
function calculateCategoryScore(category, reforms, allReformTypes) {
  // Get all reform types for this category
  const categoryReformTypes = allReformTypes.filter(rt => rt.category === category);
  const totalPossibleReforms = categoryReformTypes.length;
  
  if (totalPossibleReforms === 0) {
    return {
      reformsAdoptedCount: 0,
      totalPossibleReforms: 0,
      limitationsPenalty: 0,
      baseScore: 0,
      finalScore: 0,
      letterGrade: 'F'
    };
  }
  
  // Group reforms by reform_type_id to count unique types
  const adoptedReformTypeIds = new Set(reforms.map(r => r.reform_type_id));
  const reformsAdoptedCount = adoptedReformTypeIds.size;
  
  // Calculate total limitations penalty across all reforms
  let totalLimitationsPenalty = 0;
  const reformPenalties = new Map(); // Track penalty per reform type
  
  for (const reform of reforms) {
    const penalty = calculateReformLimitationsPenalty(reform);
    // Only count penalty once per reform type (worst case)
    if (!reformPenalties.has(reform.reform_type_id) || 
        reformPenalties.get(reform.reform_type_id) < penalty) {
      reformPenalties.set(reform.reform_type_id, penalty);
    }
  }
  
  totalLimitationsPenalty = Array.from(reformPenalties.values())
    .reduce((sum, p) => sum + p, 0);
  
  // Cap total penalty at 30 points per category
  totalLimitationsPenalty = Math.min(totalLimitationsPenalty, 30);
  
  // Base score: percentage of reform types adopted
  const baseScore = (reformsAdoptedCount / totalPossibleReforms) * 100;
  
  // Apply custom scoring rules based on category
  // Note: Custom scoring rules apply to base score, but penalties are still applied below
  let adjustedScore = baseScore;
  
  // Custom scoring rules (Parking, Housing Typology, Zoning Category still get penalties applied)
  if (category === 'Parking') {
    adjustedScore = calculateParkingScore(reforms, categoryReformTypes);
  } else if (category === 'Housing Typology') {
    adjustedScore = calculateHousingTypologyScore(reforms, categoryReformTypes);
  } else if (category === 'Zoning Category') {
    adjustedScore = calculateZoningCategoryScore(reforms, categoryReformTypes);
  } else if (category === 'Other') {
    adjustedScore = calculateOtherScore(reforms, categoryReformTypes);
  }
  // Add more category-specific rules here
  
  // Final score with limitations penalty (applied to ALL categories including Parking, Housing Typology, Zoning)
  const finalScore = Math.max(0, Math.min(100, adjustedScore - totalLimitationsPenalty));
  
  // Letter grade
  const letterGrade = getLetterGrade(finalScore);
  
  return {
    reformsAdoptedCount,
    totalPossibleReforms,
    limitationsPenalty: totalLimitationsPenalty,
    baseScore,
    finalScore,
    letterGrade
  };
}

/**
 * Get letter grade from score
 */
function getLetterGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Calculate overall grade from category grades
 */
function calculateOverallGrade(categoryGrades) {
  if (categoryGrades.length === 0) {
    return {
      overallScore: 0,
      overallLetterGrade: 'F',
      categoriesWithReforms: 0
    };
  }
  
  const overallScore = categoryGrades.reduce((sum, cg) => sum + cg.finalScore, 0) / categoryGrades.length;
  const categoriesWithReforms = categoryGrades.filter(cg => cg.reformsAdoptedCount > 0).length;
  
  return {
    overallScore,
    overallLetterGrade: getLetterGrade(overallScore),
    categoriesWithReforms
  };
}

/**
 * Main function to calculate all scores for a place
 * @param {Array} reforms - All reforms for the place
 * @param {Array} reformTypes - All reform types in the system
 * @returns {Object} Complete scoring results
 */
function calculateScores(reforms, reformTypes) {
  // Group reforms by category
  const reformsByCategory = new Map();
  
  for (const reform of reforms) {
    const reformType = reformTypes.find(rt => rt.id === reform.reform_type_id);
    if (!reformType || !reformType.category) continue;
    
    if (!reformsByCategory.has(reformType.category)) {
      reformsByCategory.set(reformType.category, []);
    }
    // reform_code should already be in reform object from query, but ensure it's set
    if (!reform.reform_code) {
      reform.reform_code = reformType.code;
    }
    reformsByCategory.get(reformType.category).push(reform);
  }
  
  // Calculate scores for each category
  const categoryGrades = [];
  for (const [category, categoryReforms] of reformsByCategory.entries()) {
    const score = calculateCategoryScore(category, categoryReforms, reformTypes);
    categoryGrades.push({
      category,
      ...score
    });
  }
  
  // Calculate overall grade
  const overallGrade = calculateOverallGrade(categoryGrades);
  
  return {
    categoryGrades,
    overallGrade
  };
}

module.exports = {
  calculateScores,
  calculateCategoryScore,
  calculateReformLimitationsPenalty,
  getLetterGrade,
  calculateOverallGrade
};
