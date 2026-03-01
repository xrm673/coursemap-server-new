import {
  resolveRequirementIds,
  ProgramFlags,
  UserContext,
  RequirementSetInput,
} from './requirement-resolver';

// ── helpers ──

const NO_DEPS: ProgramFlags = {
  year_dependent: false,
  major_dependent: false,
  college_dependent: false,
  concentration_dependent: false,
};

const makeSet = (
  overrides: Partial<Omit<RequirementSetInput, 'requirement_set_requirements'>> & {
    requirement_ids?: string[];
  } = {},
): RequirementSetInput => ({
  id: overrides.id ?? 1,
  applies_to_entry_year: overrides.applies_to_entry_year ?? null,
  applies_to_college_id: overrides.applies_to_college_id ?? null,
  applies_to_major_id: overrides.applies_to_major_id ?? null,
  applies_to_concentration_names: overrides.applies_to_concentration_names ?? null,
  requirement_set_requirements: (overrides.requirement_ids ?? ['req-default']).map(
    (id) => ({ requirement_id: id }),
  ),
});

const defaultUser: UserContext = {
  entry_year: 'FA24',
  college_id: 'AS',
  major_ids: ['CS-MAJOR'],
  concentration_names: ['Artificial Intelligence'],
};

// ── tests ──

describe('resolveRequirementIds', () => {
  // ────────────────────────────────────────────
  // 1. 无依赖：任何 set 都应匹配
  // ────────────────────────────────────────────
  describe('no dependencies', () => {
    it('should match the only set regardless of user context', () => {
      const sets = [makeSet({ requirement_ids: ['req-1', 'req-2'] })];
      expect(resolveRequirementIds(NO_DEPS, sets, defaultUser)).toEqual([
        'req-1',
        'req-2',
      ]);
    });
  });

  // ────────────────────────────────────────────
  // 2. 仅 year_dependent
  // ────────────────────────────────────────────
  describe('year_dependent only', () => {
    const flags: ProgramFlags = { ...NO_DEPS, year_dependent: true };

    it('should match the set whose entry year equals user entry year', () => {
      const sets = [
        makeSet({ id: 1, applies_to_entry_year: 'FA23', requirement_ids: ['req-old'] }),
        makeSet({ id: 2, applies_to_entry_year: 'FA24', requirement_ids: ['req-new'] }),
      ];
      expect(resolveRequirementIds(flags, sets, defaultUser)).toEqual(['req-new']);
    });

    it('should not match a set with different entry year', () => {
      const sets = [
        makeSet({ id: 1, applies_to_entry_year: 'FA23', requirement_ids: ['req-old'] }),
      ];
      expect(resolveRequirementIds(flags, sets, defaultUser)).toEqual([]);
    });
  });

  // ────────────────────────────────────────────
  // 3. 仅 college_dependent
  // ────────────────────────────────────────────
  describe('college_dependent only', () => {
    const flags: ProgramFlags = { ...NO_DEPS, college_dependent: true };

    it('should match set with matching college', () => {
      const sets = [
        makeSet({ id: 1, applies_to_college_id: 'EN', requirement_ids: ['req-en'] }),
        makeSet({ id: 2, applies_to_college_id: 'AS', requirement_ids: ['req-as'] }),
      ];
      expect(resolveRequirementIds(flags, sets, defaultUser)).toEqual(['req-as']);
    });
  });

  // ────────────────────────────────────────────
  // 4. 仅 major_dependent
  // ────────────────────────────────────────────
  describe('major_dependent only', () => {
    const flags: ProgramFlags = { ...NO_DEPS, major_dependent: true };

    it('should match set whose major_id is in user major_ids', () => {
      const sets = [
        makeSet({ id: 1, applies_to_major_id: 'MATH-MAJOR', requirement_ids: ['req-math'] }),
        makeSet({ id: 2, applies_to_major_id: 'CS-MAJOR', requirement_ids: ['req-cs'] }),
      ];
      expect(resolveRequirementIds(flags, sets, defaultUser)).toEqual(['req-cs']);
    });

    it('should match any of multiple user majors', () => {
      const sets = [
        makeSet({ id: 1, applies_to_major_id: 'MATH-MAJOR', requirement_ids: ['req-math'] }),
      ];
      const user = { ...defaultUser, major_ids: ['CS-MAJOR', 'MATH-MAJOR'] };
      expect(resolveRequirementIds(flags, sets, user)).toEqual(['req-math']);
    });

    it('should match null-major set when user has no majors', () => {
      const sets = [
        makeSet({ id: 1, applies_to_major_id: 'CS-MAJOR', requirement_ids: ['req-cs'] }),
        makeSet({ id: 2, applies_to_major_id: null, requirement_ids: ['req-no-major'] }),
      ];
      const user = { ...defaultUser, major_ids: [] };
      expect(resolveRequirementIds(flags, sets, user)).toEqual(['req-no-major']);
    });
  });

  // ────────────────────────────────────────────
  // 5. 仅 concentration_dependent
  // ────────────────────────────────────────────
  describe('concentration_dependent only', () => {
    const flags: ProgramFlags = { ...NO_DEPS, concentration_dependent: true };

    it('should match set containing user concentration', () => {
      const sets = [
        makeSet({ id: 1, applies_to_concentration_names: null, requirement_ids: ['req-base'] }),
        makeSet({ id: 2, applies_to_concentration_names: ['Artificial Intelligence'], requirement_ids: ['req-ai'] }),
        makeSet({ id: 3, applies_to_concentration_names: ['Systems'], requirement_ids: ['req-sys'] }),
      ];
      expect(resolveRequirementIds(flags, sets, defaultUser)).toEqual(['req-ai']);
    });

    it('should fall back to null-concentration set when user has no concentration', () => {
      const sets = [
        makeSet({ id: 1, applies_to_concentration_names: null, requirement_ids: ['req-base'] }),
        makeSet({ id: 2, applies_to_concentration_names: ['Artificial Intelligence'], requirement_ids: ['req-ai'] }),
      ];
      const user = { ...defaultUser, concentration_names: [] };
      expect(resolveRequirementIds(flags, sets, user)).toEqual(['req-base']);
    });

    it('should match when set lists multiple concentrations and user has one of them', () => {
      const sets = [
        makeSet({
          id: 1,
          applies_to_concentration_names: ['Artificial Intelligence', 'Machine Learning'],
          requirement_ids: ['req-ai-ml'],
        }),
      ];
      expect(resolveRequirementIds(flags, sets, defaultUser)).toEqual(['req-ai-ml']);
    });
  });

  // ────────────────────────────────────────────
  // 6. 多维度组合
  // ────────────────────────────────────────────
  describe('multiple dependencies', () => {
    it('year + college: should match set where both dimensions match', () => {
      const flags: ProgramFlags = {
        ...NO_DEPS,
        year_dependent: true,
        college_dependent: true,
      };
      const sets = [
        makeSet({ id: 1, applies_to_entry_year: 'FA24', applies_to_college_id: 'EN', requirement_ids: ['req-en-24'] }),
        makeSet({ id: 2, applies_to_entry_year: 'FA24', applies_to_college_id: 'AS', requirement_ids: ['req-as-24'] }),
        makeSet({ id: 3, applies_to_entry_year: 'FA23', applies_to_college_id: 'AS', requirement_ids: ['req-as-23'] }),
      ];
      expect(resolveRequirementIds(flags, sets, defaultUser)).toEqual(['req-as-24']);
    });

    it('year + concentration: user with concentration matches specific set', () => {
      const flags: ProgramFlags = {
        ...NO_DEPS,
        year_dependent: true,
        concentration_dependent: true,
      };
      const sets = [
        makeSet({ id: 1, applies_to_entry_year: 'FA24', applies_to_concentration_names: null, requirement_ids: ['req-24-base'] }),
        makeSet({ id: 2, applies_to_entry_year: 'FA24', applies_to_concentration_names: ['Artificial Intelligence'], requirement_ids: ['req-24-ai'] }),
      ];
      expect(resolveRequirementIds(flags, sets, defaultUser)).toEqual(['req-24-ai']);
    });

    it('year + concentration: user without concentration falls back to null set', () => {
      const flags: ProgramFlags = {
        ...NO_DEPS,
        year_dependent: true,
        concentration_dependent: true,
      };
      const sets = [
        makeSet({ id: 1, applies_to_entry_year: 'FA24', applies_to_concentration_names: null, requirement_ids: ['req-24-base'] }),
        makeSet({ id: 2, applies_to_entry_year: 'FA24', applies_to_concentration_names: ['Artificial Intelligence'], requirement_ids: ['req-24-ai'] }),
      ];
      const user = { ...defaultUser, concentration_names: [] };
      expect(resolveRequirementIds(flags, sets, user)).toEqual(['req-24-base']);
    });
  });

  // ────────────────────────────────────────────
  // 7. 边界情况：无匹配
  // ────────────────────────────────────────────
  describe('no match', () => {
    it('should return empty array when no set matches', () => {
      const flags: ProgramFlags = { ...NO_DEPS, year_dependent: true };
      const sets = [
        makeSet({ id: 1, applies_to_entry_year: 'FA22', requirement_ids: ['req-old'] }),
      ];
      expect(resolveRequirementIds(flags, sets, defaultUser)).toEqual([]);
    });
  });
});
