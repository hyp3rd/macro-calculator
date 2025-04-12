"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Calculator, Edit2, Plus, RefreshCw, Search, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

const MacroCalculator = () => {
  // State for user inputs
  const [personalInfo, setPersonalInfo] = useState({
    gender: "male",
    age: 30,
    weight: 70, // kg
    height: 175, // cm
    activityLevel: "moderate",
    goal: "maintain",
    dietType: "balanced", // diet type option (balanced, lowCarb, lowFat)
  })

  // State for calculated values
  const [calculatedValues, setCalculatedValues] = useState({
    bmr: 0,
    tdee: 0,
    targetCalories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  })

  // State for meal planning
  const [meals, setMeals] = useState([
    { id: 1, name: "Breakfast", foods: [] },
    { id: 2, name: "Lunch", foods: [] },
    { id: 3, name: "Dinner", foods: [] },
    { id: 4, name: "Snacks", foods: [] },
  ])

  // State for new food being added
  const [newFood, setNewFood] = useState({
    name: "",
    protein: 0,
    carbs: 0,
    fat: 0,
    calories: 0,
    selectedMealId: 1,
  })

  // State for total macros from all foods
  const [totalMacros, setTotalMacros] = useState({
    protein: 0,
    carbs: 0,
    fat: 0,
    calories: 0,
  })

  // State for meal plan generation
  const [isGeneratingMealPlan, setIsGeneratingMealPlan] = useState(false)
  const [mealPlanMessage, setMealPlanMessage] = useState("")

  // State for editing food portions
  const [editingFood, setEditingFood] = useState({
    mealId: null,
    foodId: null,
    portionSize: 0,
    originalFood: null,
  })

  // State for replacing food
  const [replacingFood, setReplacingFood] = useState({
    mealId: null,
    foodId: null,
    portionSize: 0,
    searchTerm: "",
    suggestions: [],
    showSuggestions: false,
  })

  // Refs for dropdowns
  const suggestionsRef = useRef(null)
  const replacementSuggestionsRef = useRef(null)

  // Food database with meal type categorization and food categories
  const foodDatabase = [
    {
      name: "Chicken Breast",
      protein: 31,
      carbs: 0,
      fat: 3.6,
      calories: 165,
      mealTypes: ["lunch", "dinner"],
      category: "lean protein",
      subCategory: "poultry",
    },
    {
      name: "Salmon",
      protein: 20,
      carbs: 0,
      fat: 13,
      calories: 208,
      mealTypes: ["lunch", "dinner"],
      category: "fatty protein",
      subCategory: "fish",
    },
    {
      name: "Egg",
      protein: 13,
      carbs: 1,
      fat: 11,
      calories: 155,
      mealTypes: ["breakfast", "lunch"],
      category: "protein",
      subCategory: "egg",
    },
    {
      name: "Greek Yogurt",
      protein: 10,
      carbs: 3.6,
      fat: 0.4,
      calories: 59,
      mealTypes: ["breakfast", "snack"],
      category: "dairy",
      subCategory: "yogurt",
    },
    {
      name: "Cottage Cheese",
      protein: 11,
      carbs: 3.4,
      fat: 4.3,
      calories: 98,
      mealTypes: ["breakfast", "snack"],
      category: "dairy",
      subCategory: "cheese",
    },
    {
      name: "Ground Beef (80/20)",
      protein: 17,
      carbs: 0,
      fat: 20,
      calories: 250,
      mealTypes: ["lunch", "dinner"],
      category: "fatty protein",
      subCategory: "beef",
    },
    {
      name: "Tofu",
      protein: 8,
      carbs: 2,
      fat: 4,
      calories: 76,
      mealTypes: ["lunch", "dinner"],
      category: "plant protein",
      subCategory: "soy",
    },
    {
      name: "Lentils",
      protein: 9,
      carbs: 20,
      fat: 0.4,
      calories: 116,
      mealTypes: ["lunch", "dinner"],
      category: "legumes",
      subCategory: "lentils",
    },
    {
      name: "Black Beans",
      protein: 8.9,
      carbs: 24,
      fat: 0.5,
      calories: 132,
      mealTypes: ["lunch", "dinner"],
      category: "legumes",
      subCategory: "beans",
    },
    {
      name: "Quinoa",
      protein: 4.4,
      carbs: 21,
      fat: 1.9,
      calories: 120,
      mealTypes: ["lunch", "dinner"],
      category: "grain",
      subCategory: "quinoa",
    },
    {
      name: "Brown Rice",
      protein: 2.6,
      carbs: 23,
      fat: 0.9,
      calories: 112,
      mealTypes: ["lunch", "dinner"],
      category: "grain",
      subCategory: "rice",
    },
    {
      name: "White Rice",
      protein: 2.7,
      carbs: 28,
      fat: 0.3,
      calories: 130,
      mealTypes: ["lunch", "dinner"],
      category: "grain",
      subCategory: "rice",
    },
    {
      name: "Sweet Potato",
      protein: 1.6,
      carbs: 20,
      fat: 0.1,
      calories: 86,
      mealTypes: ["lunch", "dinner"],
      category: "starchy veggie",
      subCategory: "potato",
    },
    {
      name: "Potato",
      protein: 2,
      carbs: 17,
      fat: 0.1,
      calories: 77,
      mealTypes: ["lunch", "dinner"],
      category: "starchy veggie",
      subCategory: "potato",
    },
    {
      name: "Broccoli",
      protein: 2.8,
      carbs: 7,
      fat: 0.4,
      calories: 34,
      mealTypes: ["lunch", "dinner"],
      category: "vegetable",
      subCategory: "cruciferous",
    },
    {
      name: "Spinach",
      protein: 2.9,
      carbs: 3.6,
      fat: 0.4,
      calories: 23,
      mealTypes: ["lunch", "dinner"],
      category: "vegetable",
      subCategory: "leafy green",
    },
    {
      name: "Avocado",
      protein: 2,
      carbs: 9,
      fat: 15,
      calories: 160,
      mealTypes: ["breakfast", "lunch", "snack"],
      category: "healthy fat",
      subCategory: "avocado",
    },
    {
      name: "Olive Oil",
      protein: 0,
      carbs: 0,
      fat: 100,
      calories: 884,
      mealTypes: ["breakfast", "lunch", "dinner"],
      category: "oil",
      subCategory: "olive oil",
    },
    {
      name: "Almonds",
      protein: 21,
      carbs: 22,
      fat: 49,
      calories: 579,
      mealTypes: ["snack"],
      category: "nuts",
      subCategory: "almonds",
    },
    {
      name: "Peanut Butter",
      protein: 25,
      carbs: 20,
      fat: 50,
      calories: 588,
      mealTypes: ["breakfast", "snack"],
      category: "nut butter",
      subCategory: "peanut",
    },
    {
      name: "Banana",
      protein: 1.1,
      carbs: 23,
      fat: 0.3,
      calories: 89,
      mealTypes: ["breakfast", "snack"],
      category: "fruit",
      subCategory: "banana",
    },
    {
      name: "Apple",
      protein: 0.3,
      carbs: 14,
      fat: 0.2,
      calories: 52,
      mealTypes: ["snack"],
      category: "fruit",
      subCategory: "apple",
    },
    {
      name: "Orange",
      protein: 0.9,
      carbs: 12,
      fat: 0.1,
      calories: 47,
      mealTypes: ["snack"],
      category: "fruit",
      subCategory: "citrus",
    },
    {
      name: "Milk (Whole)",
      protein: 3.2,
      carbs: 4.8,
      fat: 3.6,
      calories: 61,
      mealTypes: ["breakfast", "snack"],
      category: "dairy",
      subCategory: "milk",
    },
    {
      name: "Milk (Skim)",
      protein: 3.4,
      carbs: 5,
      fat: 0.1,
      calories: 34,
      mealTypes: ["breakfast", "snack"],
      category: "dairy",
      subCategory: "milk",
    },
    {
      name: "Cheese (Cheddar)",
      protein: 25,
      carbs: 1.3,
      fat: 33,
      calories: 402,
      mealTypes: ["breakfast", "lunch", "snack"],
      category: "dairy",
      subCategory: "cheese",
    },
    {
      name: "Bread (White)",
      protein: 7.6,
      carbs: 51,
      fat: 3.3,
      calories: 265,
      mealTypes: ["breakfast", "lunch"],
      category: "grain",
      subCategory: "bread",
    },
    {
      name: "Bread (Whole Wheat)",
      protein: 13,
      carbs: 43,
      fat: 3.4,
      calories: 247,
      mealTypes: ["breakfast", "lunch"],
      category: "grain",
      subCategory: "bread",
    },
    {
      name: "Pasta",
      protein: 5.8,
      carbs: 25,
      fat: 1.1,
      calories: 131,
      mealTypes: ["lunch", "dinner"],
      category: "grain",
      subCategory: "pasta",
    },
    {
      name: "Oats",
      protein: 16.9,
      carbs: 66.3,
      fat: 6.9,
      calories: 389,
      mealTypes: ["breakfast"],
      category: "grain",
      subCategory: "oats",
    },
    {
      name: "Honey",
      protein: 0.3,
      carbs: 82,
      fat: 0,
      calories: 304,
      mealTypes: ["breakfast", "snack"],
      category: "sweetener",
      subCategory: "honey",
    },
    {
      name: "Dark Chocolate",
      protein: 7.8,
      carbs: 46,
      fat: 43,
      calories: 598,
      mealTypes: ["snack"],
      category: "sweet",
      subCategory: "chocolate",
    },
    {
      name: "Protein Powder (Whey)",
      protein: 80,
      carbs: 10,
      fat: 3.5,
      calories: 400,
      mealTypes: ["breakfast", "snack"],
      category: "supplement",
      subCategory: "protein",
    },
    {
      name: "Protein Bar",
      protein: 20,
      carbs: 25,
      fat: 8,
      calories: 250,
      mealTypes: ["snack"],
      category: "supplement",
      subCategory: "protein bar",
    },
    {
      name: "Trail Mix",
      protein: 15,
      carbs: 45,
      fat: 30,
      calories: 500,
      mealTypes: ["snack"],
      category: "nuts",
      subCategory: "mixed nuts",
    },
  ]

  // Activity level multipliers
  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    veryActive: 1.9,
  }

  // Goal adjustments
  const goalAdjustments = {
    lose: 0.8, // 20% deficit
    maintain: 1.0,
    gain: 1.15, // 15% surplus
  }

  // State for food search and suggestions
  const [foodSearch, setFoodSearch] = useState("")
  const [foodSuggestions, setFoodSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // State for portion size
  const [portionSize, setPortionSize] = useState(100) // Default 100g

  // Handle clicks outside suggestions dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
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
    function handleClickOutside(event) {
      if (replacementSuggestionsRef.current && !replacementSuggestionsRef.current.contains(event.target)) {
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
  const handlePersonalInfoChange = (name, value) => {
    setPersonalInfo({
      ...personalInfo,
      [name]: value,
    })
  }

  // Handle food search input
  const handleFoodSearch = (e) => {
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
  const handleFoodSelect = (food) => {
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
  const handlePortionChange = (e) => {
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
  const handleFoodChange = (e) => {
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
      if (meal.id === Number.parseInt(newFood.selectedMealId)) {
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
      name: "",
      protein: 0,
      carbs: 0,
      fat: 0,
      calories: 0,
      selectedMealId: newFood.selectedMealId,
    })
    setFoodSearch("")
    setPortionSize(100)
  }

  // Remove a food from a meal
  const removeFood = (mealId, foodId) => {
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
  const startEditingFood = (mealId, food) => {
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
  const handleEditPortionChange = (e) => {
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
  const startReplacingFood = (mealId, food) => {
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
  const handleReplacementSearch = (e) => {
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
  const replaceFood = (newFood) => {
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

  // Calculate percentage of target macros reached
  const calculatePercentage = (current, target) => {
    if (target === 0) return 0
    return Math.min(Math.round((current / target) * 100), 100)
  }

  // Generate a full day meal plan based on target macros
  const generateMealPlan = async () => {
    setIsGeneratingMealPlan(true)
    setMealPlanMessage("Generating your personalized meal plan...")

    // Clear current meals
    const clearedMeals = meals.map((meal) => ({
      ...meal,
      foods: [],
    }))

    setMeals(clearedMeals)

    // Set meal target distributions (percentage of daily calories)
    const mealDistribution = {
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
      for (const meal of newMeals) {
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
        const mealFoods = []
        const currentMealMacros = { protein: 0, carbs: 0, fat: 0, calories: 0 }
        let iterations = 0
        const maxIterations = 150 // Prevent infinite loops

        // Keep track of used food categories to avoid redundant combinations
        const usedCategories = {}
        const usedSubCategories = {}

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
          const carbWeight = carbRatio < 0.2 ? 3 : 1 // Extra weight for low-carb targets
          const fatWeight = fatRatio > 0.4 ? 3 : 1 // Extra weight for high-fat targets

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
            const allowMultiple = ["vegetable"] // Categories where multiple items make sense

            // Filter out foods with duplicate subcategories
            const filteredBySubCategory = candidateFoods.filter((food) => {
              // Skip subcategory check if food doesn't have a subcategory
              if (!food.subCategory) return true

              // Allow multiple vegetables but cap at 2
              if (food.category === "vegetable" && usedCategories["vegetable"] < 2) {
                return true
              }

              // For all other foods, strictly enforce subcategory uniqueness
              return !usedSubCategories[food.subCategory]
            })

            // If we have foods that pass the strict subcategory filter, use those
            if (filteredBySubCategory.length > 0) {
              candidateFoods = filteredBySubCategory
            } else {
              // If we're running low on options, at least avoid exact duplicates
              candidateFoods = candidateFoods.filter(
                (food) => !mealFoods.some((mealFood) => mealFood.name === food.name),
              )
            }

            // Further prioritize foods from categories we haven't used much
            // This ensures a good balance of food groups
            const categoryLimitExceptions = ["vegetable"] // Categories where we allow more items
            const preferredFoods = candidateFoods.filter((food) => {
              if (!food.category) return true
              if (categoryLimitExceptions.includes(food.category)) {
                return (usedCategories[food.category] || 0) < 2
              }
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
              sortedFoods.sort((a, b) => b.carbs / b.calories - a.carbs / b.calories)
            } else {
              sortedFoods.sort((a, b) => b.fat / b.calories - a.fat / b.calories)
            }
          }
        }

        // Consolidate duplicate foods in the meal
        const consolidatedFoods = []
        const foodMap = {}

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
        meal.foods = consolidatedFoods

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

      // Automatically hide message after 3 seconds
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

  // Get macro color based on type
  const getMacroColor = (type) => {
    switch (type) {
      case "protein":
        return "bg-emerald-500"
      case "carbs":
        return "bg-blue-500"
      case "fat":
        return "bg-amber-500"
      default:
        return "bg-purple-500"
    }
  }

  // Get macro text color based on type
  const getMacroTextColor = (type) => {
    switch (type) {
      case "protein":
        return "text-emerald-600"
      case "carbs":
        return "text-blue-600"
      case "fat":
        return "text-amber-600"
      default:
        return "text-purple-600"
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="flex flex-col gap-6">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2">
            <Calculator className="h-6 w-6 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-800">Macro Calculator & Meal Planner</h1>
          </div>
        </header>

        <Tabs defaultValue="calculator" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="calculator">Calculator</TabsTrigger>
            <TabsTrigger value="meal-planner">Meal Planner</TabsTrigger>
          </TabsList>

          <TabsContent value="calculator">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Personal Information Form */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>Enter your details to calculate your daily macro targets</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="gender">Gender</Label>
                      <Select
                        value={personalInfo.gender}
                        onValueChange={(value) => handlePersonalInfoChange("gender", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="age">Age</Label>
                      <Input
                        id="age"
                        type="number"
                        value={personalInfo.age}
                        onChange={(e) => handlePersonalInfoChange("age", Number.parseInt(e.target.value))}
                        min="18"
                        max="100"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="weight">Weight (kg)</Label>
                      <Input
                        id="weight"
                        type="number"
                        value={personalInfo.weight}
                        onChange={(e) => handlePersonalInfoChange("weight", Number.parseFloat(e.target.value))}
                        min="40"
                        max="200"
                        step="0.1"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="height">Height (cm)</Label>
                      <Input
                        id="height"
                        type="number"
                        value={personalInfo.height}
                        onChange={(e) => handlePersonalInfoChange("height", Number.parseInt(e.target.value))}
                        min="130"
                        max="230"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="activityLevel">Activity Level</Label>
                      <Select
                        value={personalInfo.activityLevel}
                        onValueChange={(value) => handlePersonalInfoChange("activityLevel", value)}
                      >
                        <SelectTrigger>
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
                      <Label htmlFor="goal">Goal</Label>
                      <Select
                        value={personalInfo.goal}
                        onValueChange={(value) => handlePersonalInfoChange("goal", value)}
                      >
                        <SelectTrigger>
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
                      <Label htmlFor="dietType">Diet Type</Label>
                      <Select
                        value={personalInfo.dietType}
                        onValueChange={(value) => handlePersonalInfoChange("dietType", value)}
                      >
                        <SelectTrigger>
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

              {/* Calculated Results */}
              <Card>
                <CardHeader>
                  <CardTitle>Your Daily Targets</CardTitle>
                  <CardDescription>Based on your personal information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">BMR:</span>
                      <span className="font-medium">{calculatedValues.bmr} calories</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">TDEE:</span>
                      <span className="font-medium">{calculatedValues.tdee} calories</span>
                    </div>
                    <div className="flex justify-between text-base pt-1">
                      <span className="font-medium">Target:</span>
                      <span className="font-bold text-emerald-600">{calculatedValues.targetCalories} calories</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 p-3 rounded-lg text-center">
                      <p className="text-xs text-slate-500 mb-1">Protein</p>
                      <p className="font-bold text-emerald-600">{calculatedValues.protein}g</p>
                      <p className="text-xs text-slate-400">{calculatedValues.protein * 4} cal</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg text-center">
                      <p className="text-xs text-slate-500 mb-1">Carbs</p>
                      <p className="font-bold text-blue-600">{calculatedValues.carbs}g</p>
                      <p className="text-xs text-slate-400">{calculatedValues.carbs * 4} cal</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg text-center">
                      <p className="text-xs text-slate-500 mb-1">Fat</p>
                      <p className="font-bold text-amber-600">{calculatedValues.fat}g</p>
                      <p className="text-xs text-slate-400">{calculatedValues.fat * 9} cal</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Current Progress</h3>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className={getMacroTextColor("protein")}>Protein</span>
                          <span>
                            {totalMacros.protein}g / {calculatedValues.protein}g
                          </span>
                        </div>
                        <Progress
                          value={calculatePercentage(totalMacros.protein, calculatedValues.protein)}
                          className="h-2"
                          indicatorClassName={getMacroColor("protein")}
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className={getMacroTextColor("carbs")}>Carbs</span>
                          <span>
                            {totalMacros.carbs}g / {calculatedValues.carbs}g
                          </span>
                        </div>
                        <Progress
                          value={calculatePercentage(totalMacros.carbs, calculatedValues.carbs)}
                          className="h-2"
                          indicatorClassName={getMacroColor("carbs")}
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className={getMacroTextColor("fat")}>Fat</span>
                          <span>
                            {totalMacros.fat}g / {calculatedValues.fat}g
                          </span>
                        </div>
                        <Progress
                          value={calculatePercentage(totalMacros.fat, calculatedValues.fat)}
                          className="h-2"
                          indicatorClassName={getMacroColor("fat")}
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className={getMacroTextColor("calories")}>Calories</span>
                          <span>
                            {totalMacros.calories} / {calculatedValues.targetCalories}
                          </span>
                        </div>
                        <Progress
                          value={calculatePercentage(totalMacros.calories, calculatedValues.targetCalories)}
                          className="h-2"
                          indicatorClassName={getMacroColor("calories")}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="meal-planner">
            <div className="grid grid-cols-1 gap-6">
              {/* Add Food Form */}
              <Card>
                <CardHeader>
                  <CardTitle>Add Food</CardTitle>
                  <CardDescription>Search for foods or enter custom nutrition values</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-4">
                    <div className="lg:col-span-2">
                      <Label htmlFor="foodSearch">Food Name</Label>
                      <div className="relative mt-1" ref={suggestionsRef}>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                          <Input
                            id="foodSearch"
                            type="text"
                            value={foodSearch}
                            onChange={handleFoodSearch}
                            className="pl-9"
                            placeholder="Search for a food..."
                          />
                        </div>
                        {showSuggestions && foodSuggestions.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white rounded-md shadow-lg max-h-60 overflow-auto border">
                            <ul className="py-1">
                              {foodSuggestions.map((food, index) => (
                                <li
                                  key={index}
                                  className="px-4 py-2 hover:bg-slate-100 cursor-pointer"
                                  onClick={() => handleFoodSelect(food)}
                                >
                                  {food.name}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="portionSize">Portion (g)</Label>
                      <Input
                        id="portionSize"
                        type="number"
                        value={portionSize}
                        onChange={handlePortionChange}
                        className="mt-1"
                        min="0"
                        step="1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="protein">Protein (g)</Label>
                      <Input
                        id="protein"
                        name="protein"
                        type="number"
                        value={newFood.protein}
                        onChange={handleFoodChange}
                        className="mt-1"
                        min="0"
                        step="0.1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="carbs">Carbs (g)</Label>
                      <Input
                        id="carbs"
                        name="carbs"
                        type="number"
                        value={newFood.carbs}
                        onChange={handleFoodChange}
                        className="mt-1"
                        min="0"
                        step="0.1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="fat">Fat (g)</Label>
                      <Input
                        id="fat"
                        name="fat"
                        type="number"
                        value={newFood.fat}
                        onChange={handleFoodChange}
                        className="mt-1"
                        min="0"
                        step="0.1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="calories">Calories</Label>
                      <Input
                        id="calories"
                        name="calories"
                        type="number"
                        value={newFood.calories}
                        onChange={handleFoodChange}
                        className="mt-1 bg-slate-50"
                        readOnly
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-grow">
                      <Label htmlFor="selectedMealId">Add to Meal</Label>
                      <Select
                        value={newFood.selectedMealId.toString()}
                        onValueChange={(value) => setNewFood({ ...newFood, selectedMealId: Number.parseInt(value) })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select meal" />
                        </SelectTrigger>
                        <SelectContent>
                          {meals.map((meal) => (
                            <SelectItem key={meal.id} value={meal.id.toString()}>
                              {meal.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-end">
                      <Button onClick={addFood} className="w-full sm:w-auto">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Food
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Meal Plan */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Meal Plan</CardTitle>
                    <CardDescription>Track your daily meals and macros</CardDescription>
                  </div>
                  <Button
                    onClick={generateMealPlan}
                    disabled={isGeneratingMealPlan}
                    variant="outline"
                    className="ml-auto"
                  >
                    {isGeneratingMealPlan ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Generate Meal Plan
                      </>
                    )}
                  </Button>
                </CardHeader>
                <CardContent>
                  {mealPlanMessage && (
                    <div
                      className={`mb-6 p-3 rounded-md text-center ${mealPlanMessage.includes("Error") ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}
                    >
                      {mealPlanMessage}
                    </div>
                  )}

                  <div className="space-y-6">
                    {meals.map((meal) => (
                      <div key={meal.id} className="space-y-3">
                        <div className="flex items-center">
                          <h3 className="text-lg font-medium">{meal.name}</h3>
                          <Badge variant="outline" className="ml-2">
                            {Math.round(meal.foods.reduce((sum, food) => sum + food.calories, 0))} cal
                          </Badge>
                        </div>

                        {meal.foods.length === 0 ? (
                          <p className="text-slate-500 italic">No foods added yet</p>
                        ) : (
                          <div className="overflow-x-auto rounded-md border">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-slate-50 border-b">
                                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    Food
                                  </th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    Portion (g)
                                  </th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    Protein
                                  </th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    Carbs
                                  </th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    Fat
                                  </th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    Calories
                                  </th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {meal.foods.map((food) => (
                                  <tr key={food.id} className="border-b last:border-0">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {replacingFood.foodId === food.id ? (
                                        <div className="relative" ref={replacementSuggestionsRef}>
                                          <div className="relative">
                                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                            <Input
                                              type="text"
                                              value={replacingFood.searchTerm}
                                              onChange={handleReplacementSearch}
                                              className="pl-9 py-1 h-9"
                                              placeholder="Search for food..."
                                              autoFocus
                                            />
                                          </div>
                                          {replacingFood.showSuggestions && replacingFood.suggestions.length > 0 && (
                                            <div className="absolute z-10 w-full mt-1 bg-white rounded-md shadow-lg max-h-60 overflow-auto border">
                                              <ul className="py-1">
                                                {replacingFood.suggestions.map((suggestion, index) => (
                                                  <li
                                                    key={index}
                                                    className="px-4 py-2 hover:bg-slate-100 cursor-pointer text-sm"
                                                    onClick={() => replaceFood(suggestion)}
                                                  >
                                                    {suggestion.name}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        food.name
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {editingFood.foodId === food.id ? (
                                        <div className="flex items-center justify-center">
                                          <Input
                                            type="number"
                                            value={editingFood.portionSize}
                                            onChange={handleEditPortionChange}
                                            className="w-20 py-1 h-9 text-center"
                                            min="1"
                                            max="1000"
                                          />
                                        </div>
                                      ) : (
                                        food.portionSize || "-"
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-center font-medium text-emerald-600">
                                      {food.protein}g
                                    </td>
                                    <td className="px-4 py-3 text-center font-medium text-blue-600">{food.carbs}g</td>
                                    <td className="px-4 py-3 text-center font-medium text-amber-600">{food.fat}g</td>
                                    <td className="px-4 py-3 text-center font-medium">{food.calories}</td>
                                    <td className="px-4 py-3 text-right">
                                      {editingFood.foodId === food.id ? (
                                        <div className="flex items-center justify-end space-x-2">
                                          <Button
                                            onClick={saveEditedPortion}
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                          >
                                            Save
                                          </Button>
                                          <Button
                                            onClick={cancelEditing}
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-slate-600 hover:text-slate-700 hover:bg-slate-50"
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                      ) : replacingFood.foodId === food.id ? (
                                        <Button
                                          onClick={cancelReplacing}
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 text-slate-600 hover:text-slate-700 hover:bg-slate-50"
                                        >
                                          Cancel
                                        </Button>
                                      ) : (
                                        <div className="flex items-center justify-end space-x-1">
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  onClick={() => startReplacingFood(meal.id, food)}
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-8 w-8"
                                                >
                                                  <Search className="h-4 w-4" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>Replace food</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>

                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  onClick={() => startEditingFood(meal.id, food)}
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-8 w-8"
                                                >
                                                  <Edit2 className="h-4 w-4" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>Edit portion</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>

                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  onClick={() => removeFood(meal.id, food.id)}
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>Remove food</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                                {meal.foods.length > 0 && (
                                  <tr className="bg-slate-50">
                                    <td className="px-4 py-2 font-medium">Total</td>
                                    <td className="px-4 py-2 text-center">
                                      {/* Intentionally empty for Portion column */}
                                    </td>
                                    <td className="px-4 py-2 text-center font-medium text-emerald-600">
                                      {Math.round(meal.foods.reduce((sum, food) => sum + food.protein, 0))}g
                                    </td>
                                    <td className="px-4 py-2 text-center font-medium text-blue-600">
                                      {Math.round(meal.foods.reduce((sum, food) => sum + food.carbs, 0))}g
                                    </td>
                                    <td className="px-4 py-2 text-center font-medium text-amber-600">
                                      {Math.round(meal.foods.reduce((sum, food) => sum + food.fat, 0))}g
                                    </td>
                                    <td className="px-4 py-2 text-center font-medium">
                                      {Math.round(meal.foods.reduce((sum, food) => sum + food.calories, 0))}
                                    </td>
                                    <td></td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col">
                  <Separator className="mb-6" />
                  <div className="w-full">
                    <h3 className="text-lg font-medium mb-4">Daily Totals</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="bg-slate-50">
                        <CardContent className="p-4 text-center">
                          <p className="text-sm text-slate-500 mb-1">Protein</p>
                          <p className="text-xl font-bold text-emerald-600">{totalMacros.protein}g</p>
                          <p className="text-xs text-slate-400">Target: {calculatedValues.protein}g</p>
                          <Progress
                            value={calculatePercentage(totalMacros.protein, calculatedValues.protein)}
                            className="h-1.5 mt-2"
                            indicatorClassName={getMacroColor("protein")}
                          />
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-50">
                        <CardContent className="p-4 text-center">
                          <p className="text-sm text-slate-500 mb-1">Carbs</p>
                          <p className="text-xl font-bold text-blue-600">{totalMacros.carbs}g</p>
                          <p className="text-xs text-slate-400">Target: {calculatedValues.carbs}g</p>
                          <Progress
                            value={calculatePercentage(totalMacros.carbs, calculatedValues.carbs)}
                            className="h-1.5 mt-2"
                            indicatorClassName={getMacroColor("carbs")}
                          />
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-50">
                        <CardContent className="p-4 text-center">
                          <p className="text-sm text-slate-500 mb-1">Fat</p>
                          <p className="text-xl font-bold text-amber-600">{totalMacros.fat}g</p>
                          <p className="text-xs text-slate-400">Target: {calculatedValues.fat}g</p>
                          <Progress
                            value={calculatePercentage(totalMacros.fat, calculatedValues.fat)}
                            className="h-1.5 mt-2"
                            indicatorClassName={getMacroColor("fat")}
                          />
                        </CardContent>
                      </Card>
                      <Card className="bg-slate-50">
                        <CardContent className="p-4 text-center">
                          <p className="text-sm text-slate-500 mb-1">Calories</p>
                          <p className="text-xl font-bold text-purple-600">{totalMacros.calories}</p>
                          <p className="text-xs text-slate-400">Target: {calculatedValues.targetCalories}</p>
                          <Progress
                            value={calculatePercentage(totalMacros.calories, calculatedValues.targetCalories)}
                            className="h-1.5 mt-2"
                            indicatorClassName={getMacroColor("calories")}
                          />
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default MacroCalculator
