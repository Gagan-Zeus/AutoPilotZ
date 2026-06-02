import type { ProfileData } from '../src/core/entities/Profile';

export const makeProfileData = (overrides: Partial<ProfileData> = {}): ProfileData => ({
  firstName: 'Ada',
  middleName: '',
  lastName: 'Lovelace',
  preferredName: 'Ada',
  email: 'ada@example.com',
  phone: '+1 555 0100',
  alternatePhone: '+1 555 0101',
  dateOfBirth: '1815-12-10',
  gender: 'female',
  nationality: 'British',
  address: {
    lines: ['12 St James Square'],
    city: 'London',
    state: '',
    postalCode: 'SW1Y',
    country: 'United Kingdom',
  },
  linkedIn: 'https://www.linkedin.com/in/ada-lovelace',
  github: 'https://github.com/ada',
  portfolio: 'https://example.com',
  education: [
    {
      id: 'education-1',
      institution: 'University of London',
      degree: 'Mathematics',
      fieldOfStudy: 'Computing',
      startDate: '1832-01',
      endDate: '1835-01',
      current: false,
    },
  ],
  employment: [
    {
      id: 'employment-1',
      company: 'Analytical Engines Ltd',
      title: 'Researcher',
      startDate: '1842-01',
      current: true,
      location: 'London',
    },
  ],
  ...overrides,
});
