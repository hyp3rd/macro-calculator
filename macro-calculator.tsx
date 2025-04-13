"use client"

import { Calculator, Utensils } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import MacroResults from './components/macro/MacroResults';
import MealPlanner from './components/macro/MealPlanner';
import PersonalInfoForm from './components/macro/PersonalInfoForm';
import {
  CalculatedValues,
  Food,
  FoodItem,
  Meal,
  PersonalInfo,
  TotalMacros,
  activityMultipliers,
  goalAdjustments
} from './components/macro/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { foodDatabase } from './data/food-database';

const MacroCalculator = () => {
  // State for user inputs
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({
    gender: "male",
    age: 30,
    weight: 70, // kg
    height: 175, // cm
    activityLevel: "moderate",
    goal: "maintain",
    dietType: "balanced", // diet type option (balanced, lowCarb, lowFat)
  })

  // State for calculated values
  const [calculatedValues, setCalculatedValues] = useState<CalculatedValues>({
    bmr: 0,
    tdee: 0,
    targetCalories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  })

  // State for meal planning
  const [meals, setMeals] = useState<Meal[]>([
    { id: 1, name: "Breakfast", foods: [] },
    { id: 2, name: "Lunch", foods: [] },
    { id: 3, name: "Dinner", foods: [] },
    { id: 4, name: "Snacks", foods: [] },
  ])

  // State for new food being added
  const [newFood, setNewFood] = useState<FoodItem>({
    id: 0,
    name: "",
    protein: 0,
    carbs: 0,
    fat: 0,
    calories: 0,
    portionSize: 0,
    selectedMealId: 1,
  })

  // State for total macros from all foods
  const [totalMacros, setTotalMacros] = useState<TotalMacros>({
    protein: 0,
    carbs: 0,
    fat: 0,
    calories: 0,
  })

  // State for meal plan generation
  const [isGeneratingMealPlan, setIsGeneratingMealPlan] = useState(false)
  const [mealPlanMessage, setMealPlanMessage] = useState("")

  // State for editing food portions
  const [editingFood, setEditingFood] = useState<{
    mealId: number | null;
    foodId: number | null;
    portionSize: number;
    originalFood: FoodItem | null;
  }>({
    mealId: null,
    foodId: null,
    portionSize: 0,
    originalFood: null,
  })

  // State for replacing food
  const [replacingFood, setReplacingFood] = useState<{
    mealId: number | null;
    foodId: number | null;
    portionSize: number;
    searchTerm: string;
    suggestions: Food[];
    showSuggestions: boolean;
  }>({
    mealId: null,
    foodId: null,
    portionSize: 0,
    searchTerm: "",
    suggestions: [],
    showSuggestions: false,
  })

  // State for food search and suggestions
  const [foodSearch, setFoodSearch] = useState("")
  const [foodSuggestions, setFoodSuggestions] = useState<Food[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // State for portion size
  const [portionSize, setPortionSize] = useState(100) // Default 100g

  // Refs for dropdowns
  const suggestionsRef = useRef<HTMLDivElement>(null!)
  const replacementSuggestionsRef = useRef<HTMLDivElement>(null!)

  // Handle clicks outside suggestions dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Handle clicks outside replacement suggestions dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (replacementSuggestionsRef.current && !replacementSuggestionsRef.current.contains(event.target as Node)) {
        setReplacingFood((prev) => ({
          ...prev,
          showSuggestions: false,
        }))
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Calculate macros whenever personal info changes
  useEffect(() => {
    calculateMacros()
  }, [personalInfo])

  // Calculate total macros whenever meals change
  useEffect(() => {
    calculateTotalMacros()
  }, [meals])

  // Calculate BMR, TDEE, and macros
  const calculateMacros = () => {
    // Calculate BMR using Mifflin-St Jeor Equation
    let bmr
    if (personalInfo.gender === "male") {
      bmr = 10 * personalInfo.weight + 6.25 * personalInfo.height - 5 * personalInfo.age + 5
    } else {
      bmr = 10 * personalInfo.weight + 6.25 * personalInfo.height - 5 * personalInfo.age - 161
    }

    // Calculate TDEE
    const tdee = bmr * activityMultipliers[personalInfo.activityLevel]

    // Adjust calories based on goal
    const targetCalories = tdee * goalAdjustments[personalInfo.goal]

    // Calculate macros based on goal and diet type
    let proteinRatio, fatRatio, carbRatio

    // First set base values by goal
    if (personalInfo.goal === "lose") {
      proteinRatio = 0.4 // 40% of calories from protein
      fatRatio = 0.35 // 35% of calories from fat
      carbRatio = 0.25 // 25% of calories from carbs
    } else if (personalInfo.goal === "gain") {
      proteinRatio = 0.3 // 30% of calories from protein
      fatRatio = 0.25 // 25% of calories from fat
      carbRatio = 0.45 // 45% of calories from carbs
    } else {
      // maintain
      proteinRatio = 0.3 // 30% of calories from protein
      fatRatio = 0.3 // 30% of calories from fat
      carbRatio = 0.4 // 40% of calories from carbs
    }

    // Then adjust based on diet type
    if (personalInfo.dietType === "lowCarb") {
      // For low carb, we reduce carbs significantly, increase fat, and keep protein high
      carbRatio = Math.max(0.15, carbRatio - 0.2) // Reduce carbs by 20%, but minimum 15%
      proteinRatio = Math.min(0.4, proteinRatio + 0.05) // Increase protein slightly, max 40%
      fatRatio = 1 - proteinRatio - carbRatio // Fat makes up the remainder
    } else if (personalInfo.dietType === "lowFat") {
      // For low fat, we reduce fat significantly, increase carbs, and keep protein high
      fatRatio = Math.max(0.15, fatRatio - 0.15) // Reduce fat by 15%, but minimum 15%
      proteinRatio = Math.min(0.4, proteinRatio + 0.05) // Increase protein slightly, max 40%
      carbRatio = 1 - proteinRatio - fatRatio // Carbs make up the remainder
    }
    // No adjustment needed for 'balanced'

    // Convert ratios to grams
    const protein = Math.round((targetCalories * proteinRatio) / 4) // 4 calories per gram of protein
    const fat = Math.round((targetCalories * fatRatio) / 9) // 9 calories per gram of fat
    const carbs = Math.round((targetCalories * carbRatio) / 4) // 4 calories per gram of carbs

    setCalculatedValues({
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      targetCalories: Math.round(targetCalories),
      protein,
      carbs,
      fat,
    })
  }

  // Handle personal info input changes
  const handlePersonalInfoChange = (name: string, value: string | number) => {
    setPersonalInfo({
      ...personalInfo,
      [name]: value,
    })
  }

  // Handle food search input
  const handleFoodSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchTerm = e.target.value
    setFoodSearch(searchTerm)

    if (searchTerm.trim() === "") {
      setFoodSuggestions([])
      setShowSuggestions(false)
      return
    }

    const filteredFoods = foodDatabase
      .filter((food) => food.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .slice(0, 5) // Limit to 5 suggestions

    setFoodSuggestions(filteredFoods)
    setShowSuggestions(true)
  }

  // Handle food selection from suggestions
  const handleFoodSelect = (food: Food) => {
    setFoodSearch(food.name)
    setNewFood({
      ...newFood,
      name: food.name,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      calories: food.calories,
    })
    setShowSuggestions(false)
  }

  // Handle portion size change
  const handlePortionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = Number.parseFloat(e.target.value) || 0
    setPortionSize(newSize)

    // If a food is selected, recalculate macros based on new portion size
    if (foodSearch.trim() !== "") {
      const selectedFood = foodDatabase.find((food) => food.name === foodSearch)
      if (selectedFood) {
        const ratio = newSize / 100 // Database values are per 100g
        setNewFood({
          ...newFood,
          protein: Number.parseFloat((selectedFood.protein * ratio).toFixed(1)),
          carbs: Number.parseFloat((selectedFood.carbs * ratio).toFixed(1)),
          fat: Number.parseFloat((selectedFood.fat * ratio).toFixed(1)),
          calories: Math.round(selectedFood.calories * ratio),
        })
      }
    }
  }

  // Handle new food input changes
  const handleFoodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target

    if (name === "protein" || name === "carbs" || name === "fat") {
      // Automatically calculate calories when macros change
      const updatedFood = { ...newFood, [name]: Number.parseFloat(value) || 0 }
      const calories = updatedFood.protein * 4 + updatedFood.carbs * 4 + updatedFood.fat * 9

      setNewFood({
        ...updatedFood,
        calories: Math.round(calories),
      })
    } else if (name === "calories") {
      setNewFood({
        ...newFood,
        calories: Number.parseFloat(value) || 0,
      })
    } else {
      setNewFood({
        ...newFood,
        [name]: value,
      })
    }
  }

  // Add a new food to a meal
  const addFood = () => {
    // Use foodSearch instead of newFood.name for checking
    if (foodSearch.trim() === "") return

    const updatedMeals = meals.map((meal) => {
      if (meal.id === Number.parseInt(newFood.selectedMealId?.toString() || "0")) {
        return {
          ...meal,
          foods: [
            ...meal.foods,
            {
              ...newFood,
              name: foodSearch,
              id: Date.now(),
              portionSize: portionSize,
              originalValues: {
                proteinPer100g: newFood.protein / (portionSize / 100),
                carbsPer100g: newFood.carbs / (portionSize / 100),
                fatPer100g: newFood.fat / (portionSize / 100),
                caloriesPer100g: newFood.calories / (portionSize / 100),
              },
            },
          ],
        }
      }
      return meal
    })

    setMeals(updatedMeals)

    // Reset the new food form
    setNewFood({
      id: 0,
      name: "",
      protein: 0,
      carbs: 0,
      fat: 0,
      calories: 0,
      portionSize: 0,
      selectedMealId: newFood.selectedMealId,
    })
    setFoodSearch("")
    setPortionSize(100)
  }

  // Remove a food from a meal
  const removeFood = (mealId: number, foodId: number) => {
    const updatedMeals = meals.map((meal) => {
      if (meal.id === mealId) {
        return {
          ...meal,
          foods: meal.foods.filter((food) => food.id !== foodId),
        }
      }
      return meal
    })

    setMeals(updatedMeals)
  }

  // Start editing a food's portion size
  const startEditingFood = (mealId: number, food: FoodItem) => {
    setEditingFood({
      mealId,
      foodId: food.id,
      portionSize: food.portionSize,
      originalFood: food,
    })
  }

  // Cancel editing
  const cancelEditing = () => {
    setEditingFood({
      mealId: null,
      foodId: null,
      portionSize: 0,
      originalFood: null,
    })
  }

  // Handle portion size change during editing
  const handleEditPortionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = Math.max(1, Number.parseInt(e.target.value) || 0)
    setEditingFood({
      ...editingFood,
      portionSize: newSize,
    })
  }

  // Save edited portion size
  const saveEditedPortion = () => {
    const originalFood = editingFood.originalFood
    if (!originalFood) return

    // Find the original food in the database to get its base values per 100g
    const dbFood = foodDatabase.find((food) => food.name === originalFood.name)
    if (!dbFood) {
      cancelEditing()
      return
    }

    // Calculate the ratio for the new portion size
    const ratio = editingFood.portionSize / 100

    // Create updated food with new macros based on portion
    const updatedFood = {
      ...originalFood,
      portionSize: editingFood.portionSize,
      protein: Number.parseFloat((dbFood.protein * ratio).toFixed(1)),
      carbs: Number.parseFloat((dbFood.carbs * ratio).toFixed(1)),
      fat: Number.parseFloat((dbFood.fat * ratio).toFixed(1)),
      calories: Math.round(dbFood.calories * ratio),
    }

    // Update the food in the meal
    const updatedMeals = meals.map((meal) => {
      if (meal.id === editingFood.mealId) {
        return {
          ...meal,
          foods: meal.foods.map((food) => (food.id === editingFood.foodId ? updatedFood : food)),
        }
      }
      return meal
    })

    setMeals(updatedMeals)
    cancelEditing()
  }

  // Start replacing a food
  const startReplacingFood = (mealId: number, food: FoodItem) => {
    setReplacingFood({
      mealId,
      foodId: food.id,
      portionSize: food.portionSize,
      searchTerm: "",
      suggestions: [],
      showSuggestions: false,
    })
  }

  // Cancel replacing
  const cancelReplacing = () => {
    setReplacingFood({
      mealId: null,
      foodId: null,
      portionSize: 0,
      searchTerm: "",
      suggestions: [],
      showSuggestions: false,
    })
  }

  // Handle food search for replacement
  const handleReplacementSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchTerm = e.target.value

    setReplacingFood((prev) => ({
      ...prev,
      searchTerm,
      showSuggestions: searchTerm.trim() !== "",
    }))

    if (searchTerm.trim() === "") {
      setReplacingFood((prev) => ({
        ...prev,
        suggestions: [],
        showSuggestions: false,
      }))
      return
    }

    // Filter foods based on search term
    const filteredFoods = foodDatabase
      .filter((food) => food.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .slice(0, 5) // Limit to 5 suggestions

    setReplacingFood((prev) => ({
      ...prev,
      suggestions: filteredFoods,
      showSuggestions: true,
    }))
  }

  // Replace a food with a new one
  const replaceFood = (newFood: Food) => {
    // Calculate the ratio based on the portion size
    const ratio = replacingFood.portionSize / 100

    // Create new food object with calculated macros
    const replacementFood = {
      id: Date.now() + Math.random(),
      name: newFood.name,
      protein: Number.parseFloat((newFood.protein * ratio).toFixed(1)),
      carbs: Number.parseFloat((newFood.carbs * ratio).toFixed(1)),
      fat: Number.parseFloat((newFood.fat * ratio).toFixed(1)),
      calories: Math.round(newFood.calories * ratio),
      portionSize: replacingFood.portionSize,
      category: newFood.category,
      subCategory: newFood.subCategory,
      originalValues: {
        proteinPer100g: newFood.protein,
        carbsPer100g: newFood.carbs,
        fatPer100g: newFood.fat,
        caloriesPer100g: newFood.calories,
      },
    }

    // Update meals state by replacing the old food with the new one
    const updatedMeals = meals.map((meal) => {
      if (meal.id === replacingFood.mealId) {
        return {
          ...meal,
          foods: meal.foods.map((food) => (food.id === replacingFood.foodId ? replacementFood : food)),
        }
      }
      return meal
    })

    setMeals(updatedMeals)
    cancelReplacing()
  }

  // Calculate total macros from all foods
  const calculateTotalMacros = () => {
    let protein = 0
    let carbs = 0
    let fat = 0
    let calories = 0

    meals.forEach((meal) => {
      meal.foods.forEach((food) => {
        protein += food.protein
        carbs += food.carbs
        fat += food.fat
        calories += food.calories
      })
    })

    setTotalMacros({
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
      calories: Math.round(calories),
    })
  }

  // Generate a full day meal plan based on target macros
  const generateMealPlan = async () => {
    setIsGeneratingMealPlan(true)
    setMealPlanMessage("Generating your personalized meal plan...")

    // Clear current meals
    const clearedMeals = meals.map((meal) => ({
      ...meal,
      foods: [] as FoodItem[],
    }))

    setMeals(clearedMeals)

    // Set meal target distributions (percentage of daily calories)
    const mealDistribution: Record<number, number> = {
      1: 0.25, // Breakfast: 25%
      2: 0.35, // Lunch: 35%
      3: 0.3, // Dinner: 30%
      4: 0.1, // Snacks: 10%
    }

    try {
      // Simulate API call delay (replace with actual API call if needed)
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Build meal plan
      const newMeals = [...clearedMeals]

      // Calculate target macro ratios (percentage of total calories)
      const proteinCalories = calculatedValues.protein * 4
      const carbCalories = calculatedValues.carbs * 4
      const fatCalories = calculatedValues.fat * 9

      const proteinRatio = proteinCalories / calculatedValues.targetCalories
      const carbRatio = carbCalories / calculatedValues.targetCalories
      const fatRatio = fatCalories / calculatedValues.targetCalories

      console.log(
        `Target ratios - P:${(proteinRatio * 100).toFixed(1)}%, C:${(carbRatio * 100).toFixed(1)}%, F:${(fatRatio * 100).toFixed(1)}%`,
      )

      // Track total macros across all meals for balancing
      const totalPlan = { protein: 0, carbs: 0, fat: 0, calories: 0 }

      // For each meal type
      for (let i = 0; i < newMeals.length; i++) {
              const meal = newMeals[i]
              const mealTypeString = meal.name.toLowerCase()
              const mealCalorieTarget = calculatedValues.targetCalories * mealDistribution[meal.id]

        // Calculate macro targets for this specific meal
        const mealProteinTarget = calculatedValues.protein * mealDistribution[meal.id]
        const mealCarbTarget = calculatedValues.carbs * mealDistribution[meal.id]
        const mealFatTarget = calculatedValues.fat * mealDistribution[meal.id]

        // Get foods appropriate for this meal type
        const availableFoods = foodDatabase.filter((food) =>
          food.mealTypes.includes(
            mealTypeString === "breakfast"
              ? "breakfast"
              : mealTypeString === "lunch"
                ? "lunch"
                : mealTypeString === "dinner"
                  ? "dinner"
                  : "snack",
          ),
        )

        // Algorithm to select foods for this meal
        const mealFoods: FoodItem[] = []
        const currentMealMacros = { protein: 0, carbs: 0, fat: 0, calories: 0 }
        let iterations = 0
        const maxIterations = 150 // Prevent infinite loops

        // Keep track of used food categories to avoid redundant combinations
        const usedCategories: Record<string, number> = {}
        const usedSubCategories: Record<string, boolean> = {}

        // Sort foods by how well they match our target macro ratios
        let sortedFoods = [...availableFoods]

        sortedFoods.sort((a, b) => {
          // Calculate how well each food matches our target macro distribution
          // For protein-focused plans, heavily weight protein matching
          const aProteinRatio = (a.protein * 4) / a.calories
          const aCarbRatio = (a.carbs * 4) / a.calories
          const aFatRatio = (a.fat * 9) / a.calories

          const bProteinRatio = (b.protein * 4) / b.calories
          const bCarbRatio = (b.carbs * 4) / b.calories
          const bFatRatio = (b.fat * 9) / b.calories

          // Calculate how closely each food's macro ratio matches our target
          // Use weighted scoring to prioritize the most important macros

          // Use specific weights based on the macro ratios we need
          const proteinWeight = proteinRatio > 0.3 ? 3 : 1
          const carbWeight = carbRatio < 0.2 ? 3 : 1
          const fatWeight = fatRatio > 0.4 ? 3 : 1

          const aScore =
            proteinWeight * Math.abs(aProteinRatio - proteinRatio) +
            carbWeight * Math.abs(aCarbRatio - carbRatio) +
            fatWeight * Math.abs(aFatRatio - fatRatio)

          const bScore =
            proteinWeight * Math.abs(bProteinRatio - proteinRatio) +
            carbWeight * Math.abs(bCarbRatio - carbRatio) +
            fatWeight * Math.abs(bFatRatio - fatRatio)

          // Lower score is better (less deviation from target)
          return aScore - bScore
        })

        // Determine if we're protein-focused (more than 30% of calories from protein)
        const isProteinFocused = proteinRatio > 0.3

        // Keep track of remaining macro targets for this meal
        let remainingProtein = mealProteinTarget
        let remainingCarbs = mealCarbTarget
        let remainingFat = mealFatTarget
        let remainingCalories = mealCalorieTarget

        // Keep adding foods until we reach targets or max iterations
        while (
          (currentMealMacros.calories < mealCalorieTarget * 0.9 ||
            (isProteinFocused && currentMealMacros.protein < mealProteinTarget * 0.8)) &&
          iterations < maxIterations
        ) {
          iterations++

          // Use different selection approaches based on what we need most
          let selectedFood

          // If we're behind on protein by more than 15%, strongly prioritize protein foods
          if (isProteinFocused && currentMealMacros.protein < mealProteinTarget * 0.6 && iterations < 50) {
            // Get highest protein density foods
            const proteinFoods = [...availableFoods].sort((a, b) => b.protein / b.calories - a.protein / a.calories)

            // Pick from top 3 protein-rich foods
            const proteinIndex = Math.floor(Math.random() * Math.min(proteinFoods.length, 3))
            selectedFood = proteinFoods[proteinIndex]
          } else {
            // Otherwise use our balanced approach with category restrictions
            // Create a list of foods, preferring those from unused categories
            let candidateFoods = [...sortedFoods]

            // Apply strict subcategory filtering
            // Never allow two foods with the same subcategory (with a few exceptions)
            const allowMultiple = ["vegetable"]

            // Filter out foods with duplicate subcategories
            const filteredBySubCategory = candidateFoods.filter((food) => {
              // Include the food if:
              // 1. It has no subcategory
              // 2. Its subcategory is in the allowMultiple list
              // 3. Its subcategory hasn't been used yet
              return (
                !food.subCategory ||
                allowMultiple.includes(food.subCategory) ||
                !usedSubCategories[food.subCategory]
              )
            })

            // If we have foods that pass the strict subcategory filter, use those
            if (filteredBySubCategory.length > 0) {
              candidateFoods = filteredBySubCategory
            }

            // Further prioritize foods from categories we haven't used much
            // This ensures a good balance of food groups
            const categoryLimitExceptions = ["vegetable"]
            const preferredFoods = candidateFoods.filter((food) => {
              return (usedCategories[food.category] || 0) < 1
            })

            // If we have preferred foods based on category limits, use those
            if (preferredFoods.length > 0) {
              candidateFoods = preferredFoods
            }

            // If we still have multiple candidates, select a food with some randomness
            // from our best options (limited to top 3 for more consistency)
            const randomIndex = Math.floor(Math.random() * Math.min(candidateFoods.length, 3))
            selectedFood = candidateFoods[randomIndex]
          }

          if (!selectedFood) continue

          // Calculate appropriate portion size based on remaining macros
          let portionMultiplier = 1

          // If protein is our limiting factor (in high-protein diets)
          if (isProteinFocused && remainingProtein < selectedFood.protein) {
            portionMultiplier = remainingProtein / selectedFood.protein
          }
          // If calories are getting tight, scale based on remaining calories
          else if (remainingCalories < selectedFood.calories) {
            portionMultiplier = remainingCalories / selectedFood.calories
          }

          // Apply a mild portion variation (90-110% of calculated portion)
          portionMultiplier *= 0.9 + Math.random() * 0.2

          // Set minimum portion size
          portionMultiplier = Math.max(portionMultiplier, 0.25)

          // For small remaining amounts, use smaller portions
          if (remainingCalories < mealCalorieTarget * 0.2) {
            portionMultiplier = Math.min(portionMultiplier, 0.5)
          }

          // Calculate portion size in grams
          const portionSize = Math.round(portionMultiplier * 100)

          // Create the food item with adjusted portion
          const foodWithPortion = {
            id: Date.now() + Math.random(),
            name: selectedFood.name,
            protein: Number.parseFloat((selectedFood.protein * portionMultiplier).toFixed(1)),
            carbs: Number.parseFloat((selectedFood.carbs * portionMultiplier).toFixed(1)),
            fat: Number.parseFloat((selectedFood.fat * portionMultiplier).toFixed(1)),
            calories: Math.round(selectedFood.calories * portionMultiplier),
            portionSize: portionSize,
            originalValues: {
              proteinPer100g: selectedFood.protein,
              carbsPer100g: selectedFood.carbs,
              fatPer100g: selectedFood.fat,
              caloriesPer100g: selectedFood.calories,
            },
          }

          // Add to meal and update current macros
          mealFoods.push(foodWithPortion)
          currentMealMacros.protein += foodWithPortion.protein
          currentMealMacros.carbs += foodWithPortion.carbs
          currentMealMacros.fat += foodWithPortion.fat
          currentMealMacros.calories += foodWithPortion.calories

          // Track used categories and subcategories
          if (selectedFood.category) {
            usedCategories[selectedFood.category] = (usedCategories[selectedFood.category] || 0) + 1
          }
          if (selectedFood.subCategory) {
            usedSubCategories[selectedFood.subCategory] = true
          }

          // Update remaining targets
          remainingProtein = Math.max(0, mealProteinTarget - currentMealMacros.protein)
          remainingCarbs = Math.max(0, mealCarbTarget - currentMealMacros.carbs)
          remainingFat = Math.max(0, mealFatTarget - currentMealMacros.fat)
          remainingCalories = Math.max(0, mealCalorieTarget - currentMealMacros.calories)

          // Avoid selecting the same food again too frequently
          if (mealFoods.filter((f) => f.name === selectedFood.name).length >= 2) {
            sortedFoods = sortedFoods.filter((f) => f.name !== selectedFood.name)
          }

          // If we're running out of food options, break
          if (sortedFoods.length < 2) break

          // Re-sort foods based on remaining needs
          if (iterations % 3 === 0) {
            // Calculate what percentage of targets we've met
            const proteinPercent = currentMealMacros.protein / mealProteinTarget
            const carbPercent = currentMealMacros.carbs / mealCarbTarget
            const fatPercent = currentMealMacros.fat / mealFatTarget

            // Determine which macro we need most
            const lowestPercent = Math.min(proteinPercent, carbPercent, fatPercent)

            // Resort foods based on which macro we need most
            if (lowestPercent === proteinPercent) {
              sortedFoods.sort((a, b) => b.protein / b.calories - a.protein / a.calories)
            } else if (lowestPercent === carbPercent) {
              sortedFoods.sort((a, b) => b.carbs / b.calories - a.carbs / a.calories)
            } else {
              sortedFoods.sort((a, b) => b.fat / b.calories - a.fat / a.calories)
            }
          }
        }

        // Consolidate duplicate foods in the meal
        const consolidatedFoods: FoodItem[] = []
        const foodMap: Record<string, FoodItem> = {}

        for (const food of mealFoods) {
          if (foodMap[food.name]) {
            // Combine with existing entry
            foodMap[food.name].protein += food.protein
            foodMap[food.name].carbs += food.carbs
            foodMap[food.name].fat += food.fat
            foodMap[food.name].calories += food.calories
            foodMap[food.name].portionSize += food.portionSize
          } else {
            // Create new entry
            foodMap[food.name] = { ...food }
          }
        }

        // Convert map back to array
        for (const name in foodMap) {
          // Round the values after consolidation
          const consolidatedFood = foodMap[name]
          consolidatedFood.protein = Number.parseFloat(consolidatedFood.protein.toFixed(1))
          consolidatedFood.carbs = Number.parseFloat(consolidatedFood.carbs.toFixed(1))
          consolidatedFood.fat = Number.parseFloat(consolidatedFood.fat.toFixed(1))

          consolidatedFoods.push(consolidatedFood)
        }

        // Check if the totals are reasonable (for validation)
        const mealTotals = {
          protein: consolidatedFoods.reduce((sum, food) => sum + food.protein, 0),
          carbs: consolidatedFoods.reduce((sum, food) => sum + food.carbs, 0),
          fat: consolidatedFoods.reduce((sum, food) => sum + food.fat, 0),
          calories: consolidatedFoods.reduce((sum, food) => sum + food.calories, 0),
        }

        // Log meal totals for debugging
        console.log(
          `${meal.name} totals: P=${mealTotals.protein.toFixed(1)}g, C=${mealTotals.carbs.toFixed(1)}g, F=${mealTotals.fat.toFixed(1)}g, Cal=${mealTotals.calories}`,
        )

        // Update this meal with the consolidated foods
        newMeals[i] = {
          ...newMeals[i],
          foods: consolidatedFoods
        }

        // Update total plan macros
        totalPlan.protein += mealTotals.protein
        totalPlan.carbs += mealTotals.carbs
        totalPlan.fat += mealTotals.fat
        totalPlan.calories += mealTotals.calories
      }

      // Calculate how close we are to targets
      const proteinPercent = (totalPlan.protein / calculatedValues.protein) * 100
      const carbPercent = (totalPlan.carbs / calculatedValues.carbs) * 100
      const fatPercent = (totalPlan.fat / calculatedValues.fat) * 100
      const caloriePercent = (totalPlan.calories / calculatedValues.targetCalories) * 100

      console.log(
        `Final plan - P:${proteinPercent.toFixed(1)}%, C:${carbPercent.toFixed(1)}%, F:${fatPercent.toFixed(1)}%, Cal:${caloriePercent.toFixed(1)}%`,
      )

      // Add a message about the meal plan quality
      let qualityMessage = "Meal plan generated successfully!"
      if (
        proteinPercent > 85 &&
        proteinPercent < 115 &&
        carbPercent > 85 &&
        carbPercent < 115 &&
        fatPercent > 85 &&
        fatPercent < 115
      ) {
        qualityMessage = "Excellent meal plan generated with balanced macros!"
      } else if (
        proteinPercent < 70 ||
        proteinPercent > 130 ||
        carbPercent < 70 ||
        carbPercent > 130 ||
        fatPercent < 70 ||
        fatPercent > 130
      ) {
        qualityMessage =
          "Meal plan generated, but some macro targets were difficult to meet perfectly with available foods."
      }

      setMealPlanMessage(qualityMessage)
      setMeals(newMeals)

      // Automatically hide message after 5 seconds
      setTimeout(() => {
        setMealPlanMessage("")
      }, 5000)
    } catch (error) {
      setMealPlanMessage("Error generating meal plan. Please try again.")
      console.error("Meal plan generation error:", error)
    } finally {
      setIsGeneratingMealPlan(false)
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="flex flex-col gap-6">
        <header className="flex items-center justify-between py-8">
          <div className="flex items-center gap-3">
            <div className="bg-teal-100 p-3 rounded-xl">
              <Calculator className="h-7 w-7 text-teal-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">NutriTrack</h1>
              <p className="text-gray-500">Macro Calculator & Meal Planner</p>
            </div>
          </div>
        </header>

        <Tabs defaultValue="calculator" className="w-full">
          <TabsList className="mb-6 bg-gray-100 p-1 rounded-lg">
            <TabsTrigger value="calculator" className="rounded-md px-6 py-2.5 data-[state=active]:bg-white">
              <Calculator className="h-4 w-4 mr-2" />
              Calculator
            </TabsTrigger>
            <TabsTrigger value="meal-planner" className="rounded-md px-6 py-2.5 data-[state=active]:bg-white">
              <Utensils className="h-4 w-4 mr-2" />
              Meal Planner
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calculator">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <PersonalInfoForm
                personalInfo={personalInfo}
                onPersonalInfoChange={handlePersonalInfoChange}
              />
              <MacroResults
                calculatedValues={calculatedValues}
                totalMacros={totalMacros}
              />
            </div>
          </TabsContent>

          <TabsContent value="meal-planner">
            <MealPlanner
              calculatedValues={calculatedValues}
              totalMacros={totalMacros}
              meals={meals}
              newFood={newFood}
              foodSearch={foodSearch}
              foodSuggestions={foodSuggestions}
              showSuggestions={showSuggestions}
              portionSize={portionSize}
              isGeneratingMealPlan={isGeneratingMealPlan}
              mealPlanMessage={mealPlanMessage}
              editingFood={editingFood}
              replacingFood={replacingFood}
              suggestionsRef={suggestionsRef}
              replacementSuggestionsRef={replacementSuggestionsRef}
              setNewFood={setNewFood}
              setFoodSearch={setFoodSearch}
              setPortionSize={setPortionSize}
              handleFoodSearch={handleFoodSearch}
              handleFoodSelect={handleFoodSelect}
              handlePortionChange={handlePortionChange}
              handleFoodChange={handleFoodChange}
              addFood={addFood}
              removeFood={removeFood}
              startEditingFood={startEditingFood}
              cancelEditing={cancelEditing}
              handleEditPortionChange={handleEditPortionChange}
              saveEditedPortion={saveEditedPortion}
              startReplacingFood={startReplacingFood}
              cancelReplacing={cancelReplacing}
              handleReplacementSearch={handleReplacementSearch}
              replaceFood={replaceFood}
              generateMealPlan={generateMealPlan}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default MacroCalculator
