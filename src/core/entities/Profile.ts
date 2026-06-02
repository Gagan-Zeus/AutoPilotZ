export type ProfileAttributeValue = string | number | boolean;

export interface AddressData {
  lines: string[];
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  notes?: string;
}

export interface EmploymentEntry {
  id: string;
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  location?: string;
  summary?: string;
}

export interface ResumeMetadata {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  updatedAt: string;
}

export interface ProfileData {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  email: string;
  phone: string;
  alternatePhone: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  address: AddressData;
  linkedIn: string;
  github: string;
  portfolio: string;
  education: EducationEntry[];
  employment: EmploymentEntry[];
  resumeMetadata?: ResumeMetadata;
}

export interface VaultProfile {
  id: string;
  label: string;
  data: ProfileData;
  attributes: Record<string, ProfileAttributeValue>;
  createdAt: string;
  updatedAt: string;
}

export interface EncryptedProfileRecord {
  id: string;
  encryptedPayload: string;
  iv: string;
  updatedAt: string;
}

export type ProfileValidationSeverity = 'error' | 'warning';

export interface ProfileValidationIssue {
  field: string;
  message: string;
  severity: ProfileValidationSeverity;
}

export interface ProfileValidationResult {
  valid: boolean;
  issues: ProfileValidationIssue[];
}

export interface ExportedVaultBundle {
  version: 1;
  exportedAt: string;
  salt: string;
  iv: string;
  encryptedPayload: string;
}

export interface ExportedVaultPayload {
  profiles: VaultProfile[];
}

export const emptyProfileData = (): ProfileData => ({
  firstName: '',
  middleName: '',
  lastName: '',
  preferredName: '',
  email: '',
  phone: '',
  alternatePhone: '',
  dateOfBirth: '',
  gender: '',
  nationality: '',
  address: {
    lines: ['', ''],
    city: '',
    state: '',
    postalCode: '',
    country: '',
  },
  linkedIn: '',
  github: '',
  portfolio: '',
  education: [],
  employment: [],
});

export const createProfile = (
  input: Pick<VaultProfile, 'label'> & {
    data: ProfileData;
    id?: string;
    createdAt?: string;
  },
  now = new Date(),
): VaultProfile => {
  const timestamp = now.toISOString();
  const data = normalizeProfileData(input.data);

  return {
    id: input.id ?? crypto.randomUUID(),
    label: input.label.trim(),
    data,
    attributes: profileDataToAttributes(data),
    createdAt: input.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
};

export const normalizeProfileData = (data: ProfileData): ProfileData => ({
  ...emptyProfileData(),
  ...data,
  firstName: data.firstName.trim(),
  middleName: data.middleName.trim(),
  lastName: data.lastName.trim(),
  preferredName: data.preferredName.trim(),
  email: data.email.trim().toLowerCase(),
  phone: data.phone.trim(),
  alternatePhone: data.alternatePhone.trim(),
  dateOfBirth: data.dateOfBirth.trim(),
  gender: data.gender.trim(),
  nationality: data.nationality.trim(),
  address: {
    lines: data.address.lines.map((line) => line.trim()).filter(Boolean),
    city: data.address.city.trim(),
    state: data.address.state.trim(),
    postalCode: data.address.postalCode.trim(),
    country: data.address.country.trim(),
  },
  linkedIn: data.linkedIn.trim(),
  github: data.github.trim(),
  portfolio: data.portfolio.trim(),
  education: data.education.map((entry) => ({
    ...entry,
    id: entry.id || crypto.randomUUID(),
    institution: entry.institution.trim(),
    degree: entry.degree.trim(),
    fieldOfStudy: entry.fieldOfStudy.trim(),
    startDate: entry.startDate.trim(),
    endDate: entry.endDate?.trim() || undefined,
    notes: entry.notes?.trim() || undefined,
  })),
  employment: data.employment.map((entry) => ({
    ...entry,
    id: entry.id || crypto.randomUUID(),
    company: entry.company.trim(),
    title: entry.title.trim(),
    startDate: entry.startDate.trim(),
    endDate: entry.endDate?.trim() || undefined,
    location: entry.location?.trim() || undefined,
    summary: entry.summary?.trim() || undefined,
  })),
  resumeMetadata: data.resumeMetadata
    ? {
        ...data.resumeMetadata,
        fileName: data.resumeMetadata.fileName.trim(),
        mimeType: data.resumeMetadata.mimeType.trim(),
        sha256: data.resumeMetadata.sha256.trim().toLowerCase(),
        updatedAt: data.resumeMetadata.updatedAt.trim(),
      }
    : undefined,
});

export const profileDataToAttributes = (
  data: ProfileData,
): Record<string, ProfileAttributeValue> => ({
  firstName: data.firstName,
  middleName: data.middleName,
  lastName: data.lastName,
  preferredName: data.preferredName,
  fullName: [data.firstName, data.middleName, data.lastName].filter(Boolean).join(' '),
  email: data.email,
  phone: data.phone,
  alternatePhone: data.alternatePhone,
  dateOfBirth: data.dateOfBirth,
  gender: data.gender,
  nationality: data.nationality,
  address: data.address.lines.join(', '),
  addressLine1: data.address.lines[0] ?? '',
  addressLine2: data.address.lines[1] ?? '',
  city: data.address.city,
  state: data.address.state,
  postalCode: data.address.postalCode,
  country: data.address.country,
  linkedIn: data.linkedIn,
  github: data.github,
  portfolio: data.portfolio,
});

export const validateProfileData = (data: ProfileData): ProfileValidationResult => {
  const normalized = normalizeProfileData(data);
  const issues: ProfileValidationIssue[] = [];

  requireField(issues, 'firstName', normalized.firstName, 'First name is required.');
  requireField(issues, 'lastName', normalized.lastName, 'Last name is required.');
  requireField(issues, 'email', normalized.email, 'Email is required.');

  if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    issues.push({ field: 'email', message: 'Email must be valid.', severity: 'error' });
  }

  for (const field of ['phone', 'alternatePhone'] as const) {
    const value = normalized[field];
    if (value && !/^[+\d][\d\s().-]{6,}$/.test(value)) {
      issues.push({
        field,
        message: `${field === 'phone' ? 'Phone' : 'Alternate phone'} must be valid.`,
        severity: 'error',
      });
    }
  }

  if (normalized.dateOfBirth && !isValidDate(normalized.dateOfBirth)) {
    issues.push({
      field: 'dateOfBirth',
      message: 'Date of birth must use YYYY-MM-DD.',
      severity: 'error',
    });
  }

  for (const [field, value] of [
    ['linkedIn', normalized.linkedIn],
    ['github', normalized.github],
    ['portfolio', normalized.portfolio],
  ] as const) {
    if (value && !isValidUrl(value)) {
      issues.push({ field, message: `${field} must be a valid URL.`, severity: 'error' });
    }
  }

  normalized.education.forEach((entry, index) => {
    requireField(
      issues,
      `education.${index}.institution`,
      entry.institution,
      'Education institution is required.',
    );
    validateDateRange(issues, `education.${index}`, entry.startDate, entry.endDate, entry.current);
  });

  normalized.employment.forEach((entry, index) => {
    requireField(
      issues,
      `employment.${index}.company`,
      entry.company,
      'Employment company is required.',
    );
    requireField(issues, `employment.${index}.title`, entry.title, 'Employment title is required.');
    validateDateRange(issues, `employment.${index}`, entry.startDate, entry.endDate, entry.current);
  });

  if (normalized.resumeMetadata) {
    const { resumeMetadata } = normalized;
    requireField(
      issues,
      'resumeMetadata.fileName',
      resumeMetadata.fileName,
      'Resume file is required.',
    );
    if (resumeMetadata.sizeBytes < 0) {
      issues.push({
        field: 'resumeMetadata.sizeBytes',
        message: 'Resume size must be positive.',
        severity: 'error',
      });
    }
    if (resumeMetadata.sha256 && !/^[a-f0-9]{64}$/.test(resumeMetadata.sha256)) {
      issues.push({
        field: 'resumeMetadata.sha256',
        message: 'Resume checksum must be a SHA-256 hex digest.',
        severity: 'error',
      });
    }
  }

  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    issues,
  };
};

const requireField = (
  issues: ProfileValidationIssue[],
  field: string,
  value: string,
  message: string,
) => {
  if (!value) {
    issues.push({ field, message, severity: 'error' });
  }
};

const validateDateRange = (
  issues: ProfileValidationIssue[],
  prefix: string,
  startDate: string,
  endDate: string | undefined,
  current: boolean,
) => {
  if (!startDate || !isValidYearMonthOrDate(startDate)) {
    issues.push({
      field: `${prefix}.startDate`,
      message: 'Start date must use YYYY-MM or YYYY-MM-DD.',
      severity: 'error',
    });
  }

  if (!current && (!endDate || !isValidYearMonthOrDate(endDate))) {
    issues.push({
      field: `${prefix}.endDate`,
      message: 'End date must use YYYY-MM or YYYY-MM-DD unless current is true.',
      severity: 'error',
    });
  }
};

const isValidUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

const isValidDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

const isValidYearMonthOrDate = (value: string): boolean =>
  /^\d{4}-\d{2}(-\d{2})?$/.test(value) &&
  !Number.isNaN(Date.parse(value.length === 7 ? `${value}-01` : value));
