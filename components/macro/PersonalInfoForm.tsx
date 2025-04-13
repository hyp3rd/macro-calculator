import React from 'react';
import { PersonalInfo } from '../../components/macro/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface PersonalInfoFormProps {
  personalInfo: PersonalInfo;
  onPersonalInfoChange: (name: string, value: string | number) => void;
}

const PersonalInfoForm: React.FC<PersonalInfoFormProps> = ({
  personalInfo,
  onPersonalInfoChange
}) => {
  return (
    <Card className="lg:col-span-2 border-none shadow-lg">
      <CardHeader className="bg-gradient-to-r from-teal-50 to-violet-50 rounded-t-xl">
        <CardTitle className="text-2xl">Personal Information</CardTitle>
        <CardDescription>Enter your details to calculate your daily macro targets</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="gender" className="text-gray-700">
              Gender
            </Label>
            <Select
              value={personalInfo.gender}
              onValueChange={(value) => onPersonalInfoChange("gender", value)}
            >
              <SelectTrigger className="bg-gray-50 border-gray-200">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="age" className="text-gray-700">
              Age
            </Label>
            <Input
              id="age"
              type="number"
              value={personalInfo.age}
              onChange={(e) => onPersonalInfoChange("age", Number.parseInt(e.target.value))}
              min="18"
              max="100"
              className="bg-gray-50 border-gray-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="weight" className="text-gray-700">
              Weight (kg)
            </Label>
            <Input
              id="weight"
              type="number"
              value={personalInfo.weight}
              onChange={(e) => onPersonalInfoChange("weight", Number.parseFloat(e.target.value))}
              min="40"
              max="200"
              step="0.1"
              className="bg-gray-50 border-gray-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="height" className="text-gray-700">
              Height (cm)
            </Label>
            <Input
              id="height"
              type="number"
              value={personalInfo.height}
              onChange={(e) => onPersonalInfoChange("height", Number.parseInt(e.target.value))}
              min="130"
              max="230"
              className="bg-gray-50 border-gray-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="activityLevel" className="text-gray-700">
              Activity Level
            </Label>
            <Select
              value={personalInfo.activityLevel}
              onValueChange={(value) => onPersonalInfoChange("activityLevel", value)}
            >
              <SelectTrigger className="bg-gray-50 border-gray-200">
                <SelectValue placeholder="Select activity level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentary">Sedentary (little or no exercise)</SelectItem>
                <SelectItem value="light">Light (exercise 1-3 days/week)</SelectItem>
                <SelectItem value="moderate">Moderate (exercise 3-5 days/week)</SelectItem>
                <SelectItem value="active">Active (exercise 6-7 days/week)</SelectItem>
                <SelectItem value="veryActive">
                  Very Active (physically demanding job or 2x training)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal" className="text-gray-700">
              Goal
            </Label>
            <Select
              value={personalInfo.goal}
              onValueChange={(value) => onPersonalInfoChange("goal", value)}
            >
              <SelectTrigger className="bg-gray-50 border-gray-200">
                <SelectValue placeholder="Select goal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lose">Lose Weight</SelectItem>
                <SelectItem value="maintain">Maintain Weight</SelectItem>
                <SelectItem value="gain">Gain Weight/Muscle</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dietType" className="text-gray-700">
              Diet Type
            </Label>
            <Select
              value={personalInfo.dietType}
              onValueChange={(value) => onPersonalInfoChange("dietType", value)}
            >
              <SelectTrigger className="bg-gray-50 border-gray-200">
                <SelectValue placeholder="Select diet type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balanced">Balanced (Standard)</SelectItem>
                <SelectItem value="lowCarb">Low Carb</SelectItem>
                <SelectItem value="lowFat">Low Fat</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PersonalInfoForm;