import type { ProfileData, ProfileValidationResult } from '../entities/Profile';
import { validateProfileData } from '../entities/Profile';

export class ValidateProfileUseCase {
  execute(data: ProfileData): ProfileValidationResult {
    return validateProfileData(data);
  }
}
