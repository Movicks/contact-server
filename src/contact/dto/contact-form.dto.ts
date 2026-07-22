import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ContactFormDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString()
  @MaxLength(100)
  name: string;

  @IsNotEmpty({ message: 'Customer/Business name is required' })
  @IsString()
  @MaxLength(100)
  customerName: string;

  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @MaxLength(20)
  phone: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email format' })
  @MaxLength(100)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  systemSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}