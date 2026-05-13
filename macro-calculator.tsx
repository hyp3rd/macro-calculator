"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApplyTemplateDialog } from "./components/macro/ApplyTemplateDialog";
import { CustomFoodForm } from "./components/macro/CustomFoodForm";
import MacroResults from "./components/macro/MacroResults";
import MealPlanner from "./components/macro/MealPlanner";
import PersonalInfoForm from "./components/macro/PersonalInfoForm";
import { SaveTemplateDialog } from "./components/macro/SaveTemplateDialog";
import {
  CalculatedValues,
  Food,
  FoodItem,
  Meal,
  PersonalInfo,
  TotalMacros,
} from "./components/macro/types";
import { AppShell } from "./components/shell/AppShell";
import type { ViewKey } from "./components/shell/Sidebar";
import { foodDatabase } from "./data/food-database";
import { useDailyLog } from "./hooks/use-daily-log";
import { useFoodSearch } from "./hooks/use-food-search";
import { useProfile } from "./hooks/use-profile";
import { useToday } from "./hooks/use-today";
import {
  addCustomFood,
  customToFood,
  listCustomFoods,
  type MealTemplate,
} from "./lib/db";
import { computeMacros } from "./lib/macros";
import { planDay, summarisePlan } from "./lib/meal-planner";

const DEFAULT_PROFILE: PersonalInfo = {
  gender: "male",
  age: 30,
  weight: 70,
  height: 175,
  activityLevel: "moderate",
  goal: "maintain",
  dietType: "balanced",
  weeklyRateKg: 0.5,
  manualTdee: null,
};

const DEFAULT_MEALS: Meal[] = [
  { id: 1, name: "Breakfast", foods: [] },
  { id: 2, name: "Lunch", foods: [] },
  { id: 3, name: "Dinner", foods: [] },
  { id: 4, name: "Snacks", foods: [] },
];

const MacroCalculator = () => {
  // Persisted profile. Defaults are used until the IndexedDB hydration
  // completes (a few ms after mount).
  const {
    profile: personalInfo,
    setProfile: setPersonalInfo,
    isHydrated: profileHydrated,
  } = useProfile(DEFAULT_PROFILE);

  // Currently displayed day. `null` means "follow today" — useful so the
  // log live-updates across midnight when the user isn't pinned to a
  // specific historical date.
  const today = useToday();
  const [explicitDate, setExplicitDate] = useState<string | null>(null);
  const selectedDate = explicitDate ?? today;

  const {
    meals,
    setMeals,
    isHydrated: dailyLogHydrated,
  } = useDailyLog(selectedDate, DEFAULT_MEALS);
  const isHydrated = profileHydrated && dailyLogHydrated;

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
  });

  // State for meal plan generation
  const [isGeneratingMealPlan, setIsGeneratingMealPlan] = useState(false);
  const [mealPlanMessage, setMealPlanMessage] = useState("");

  // State for editing food portions
  const [editingFood, setEditingFood] = useState<{
    mealId: number | null;
    foodId: number | null;
    portionSize: number;
    originalFood: FoodItem | null;
  }>({ mealId: null, foodId: null, portionSize: 0, originalFood: null });

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
  });

  // State for food search and suggestions
  const [foodSearch, setFoodSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Per-100g reference for the last-picked food. Drives portion recalculation
  // across all three sources (builtin / custom / OFF) without re-querying.
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  // Bump to force the search hook to re-query custom foods after a save.
  const [customFoodsRev, setCustomFoodsRev] = useState(0);
  const [customFoodOpen, setCustomFoodOpen] = useState(false);
  // Meal templates: which dialog is open and for which meal. `null` =
  // no dialog. The dialogs themselves read templates from IDB on open.
  const [templateDialog, setTemplateDialog] = useState<
    { kind: "save"; mealId: number } | { kind: "apply"; mealId: number } | null
  >(null);
  const [view, setView] = useState<ViewKey>("calculator");

  const search = useFoodSearch(foodSearch, customFoodsRev);
  const foodSuggestions = search.results;

  // State for portion size
  const [portionSize, setPortionSize] = useState(100); // Default 100g

  // Refs for dropdowns
  const suggestionsRef = useRef<HTMLDivElement>(null!);
  const replacementSuggestionsRef = useRef<HTMLDivElement>(null!);

  // Handle clicks outside suggestions dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle clicks outside replacement suggestions dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        replacementSuggestionsRef.current &&
        !replacementSuggestionsRef.current.contains(event.target as Node)
      ) {
        setReplacingFood((prev) => ({ ...prev, showSuggestions: false }));
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const calculatedValues = useMemo<CalculatedValues>(
    () => computeMacros(personalInfo),
    [personalInfo],
  );

  // Derived: aggregate macros across all logged foods.
  const totalMacros = useMemo<TotalMacros>(() => {
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    let calories = 0;

    meals.forEach((meal) => {
      meal.foods.forEach((food) => {
        protein += food.protein;
        carbs += food.carbs;
        fat += food.fat;
        calories += food.calories;
      });
    });

    return {
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
      calories: Math.round(calories),
    };
  }, [meals]);

  // Handle personal info input changes
  const handlePersonalInfoChange = (
    name: string,
    value: string | number | null,
  ) => {
    setPersonalInfo({ ...personalInfo, [name]: value });
  };

  // Handle food search input
  const handleFoodSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFoodSearch(e.target.value);
    setShowSuggestions(e.target.value.trim() !== "");
  };

  // Handle food selection from suggestions
  const handleFoodSelect = (food: Food) => {
    setSelectedFood(food);
    setFoodSearch(food.name);
    const ratio = portionSize / 100;
    setNewFood({
      ...newFood,
      name: food.name,
      protein: Number.parseFloat((food.protein * ratio).toFixed(1)),
      carbs: Number.parseFloat((food.carbs * ratio).toFixed(1)),
      fat: Number.parseFloat((food.fat * ratio).toFixed(1)),
      calories: Math.round(food.calories * ratio),
    });
    setShowSuggestions(false);
  };

  // Save an OFF result to the user's custom foods. Reuses macros as-is.
  const handleSaveOffToCustom = async (food: Food) => {
    if (food.source !== "off") return;
    await addCustomFood({
      name: food.name,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      calories: food.calories,
      brand: food.brand,
    });
    setCustomFoodsRev((r) => r + 1);
  };

  // Called when the CustomFoodForm dialog successfully saves a new food.
  const handleCustomFoodSaved = (food: Food) => {
    setCustomFoodsRev((r) => r + 1);
    handleFoodSelect(food);
  };

  // Append a template's foods to the target meal. Each food gets a fresh
  // local id so subsequent edits don't collide with the template's saved
  // foods or other meals' foods.
  const handleApplyTemplate = (template: MealTemplate) => {
    if (templateDialog?.kind !== "apply") return;
    const targetId = templateDialog.mealId;
    let nextId = Date.now();
    const cloned = template.foods.map((f) => ({ ...f, id: nextId++ }));
    setMeals(
      meals.map((m) =>
        m.id === targetId ? { ...m, foods: [...m.foods, ...cloned] } : m,
      ),
    );
  };

  // Handle portion size change
  const handlePortionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = Number.parseFloat(e.target.value);
    const newSize = Number.isNaN(parsed) ? 0 : parsed;
    setPortionSize(newSize);
    if (selectedFood) {
      const ratio = newSize / 100;
      setNewFood({
        ...newFood,
        protein: Number.parseFloat((selectedFood.protein * ratio).toFixed(1)),
        carbs: Number.parseFloat((selectedFood.carbs * ratio).toFixed(1)),
        fat: Number.parseFloat((selectedFood.fat * ratio).toFixed(1)),
        calories: Math.round(selectedFood.calories * ratio),
      });
    }
  };

  // Handle new food input changes
  const handleFoodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === "protein" || name === "carbs" || name === "fat") {
      // Automatically calculate calories when macros change
      const updatedFood = { ...newFood, [name]: Number.parseFloat(value) || 0 };
      const calories =
        updatedFood.protein * 4 + updatedFood.carbs * 4 + updatedFood.fat * 9;

      setNewFood({ ...updatedFood, calories: Math.round(calories) });
    } else if (name === "calories") {
      setNewFood({ ...newFood, calories: Number.parseFloat(value) || 0 });
    } else {
      setNewFood({ ...newFood, [name]: value });
    }
  };

  // Add a new food to a meal
  const addFood = () => {
    // Use foodSearch instead of newFood.name for checking
    if (foodSearch.trim() === "") return;

    const updatedMeals = meals.map((meal) => {
      if (
        meal.id === Number.parseInt(newFood.selectedMealId?.toString() || "0")
      ) {
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
        };
      }
      return meal;
    });

    setMeals(updatedMeals);

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
    });
    setFoodSearch("");
    setPortionSize(100);
  };

  // Remove a food from a meal
  const removeFood = (mealId: number, foodId: number) => {
    const updatedMeals = meals.map((meal) => {
      if (meal.id === mealId) {
        return {
          ...meal,
          foods: meal.foods.filter((food) => food.id !== foodId),
        };
      }
      return meal;
    });

    setMeals(updatedMeals);
  };

  // Start editing a food's portion size
  const startEditingFood = (mealId: number, food: FoodItem) => {
    setEditingFood({
      mealId,
      foodId: food.id,
      portionSize: food.portionSize,
      originalFood: food,
    });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingFood({
      mealId: null,
      foodId: null,
      portionSize: 0,
      originalFood: null,
    });
  };

  // Handle portion size change during editing
  const handleEditPortionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = Math.max(1, Number.parseInt(e.target.value) || 0);
    setEditingFood({ ...editingFood, portionSize: newSize });
  };

  // Save edited portion size
  const saveEditedPortion = () => {
    const originalFood = editingFood.originalFood;
    if (!originalFood) return;

    // Prefer the per-100g values captured at add-time (works for builtin,
    // custom, and OFF foods). Fall back to a builtin lookup for legacy
    // entries that pre-date the originalValues capture.
    let proteinPer100g: number | undefined;
    let carbsPer100g: number | undefined;
    let fatPer100g: number | undefined;
    let caloriesPer100g: number | undefined;
    if (originalFood.originalValues) {
      ({ proteinPer100g, carbsPer100g, fatPer100g, caloriesPer100g } =
        originalFood.originalValues);
    } else {
      const dbFood = foodDatabase.find((f) => f.name === originalFood.name);
      if (!dbFood) {
        cancelEditing();
        return;
      }
      proteinPer100g = dbFood.protein;
      carbsPer100g = dbFood.carbs;
      fatPer100g = dbFood.fat;
      caloriesPer100g = dbFood.calories;
    }

    const ratio = editingFood.portionSize / 100;
    const updatedFood = {
      ...originalFood,
      portionSize: editingFood.portionSize,
      protein: Number.parseFloat((proteinPer100g * ratio).toFixed(1)),
      carbs: Number.parseFloat((carbsPer100g * ratio).toFixed(1)),
      fat: Number.parseFloat((fatPer100g * ratio).toFixed(1)),
      calories: Math.round(caloriesPer100g * ratio),
    };

    // Update the food in the meal
    const updatedMeals = meals.map((meal) => {
      if (meal.id === editingFood.mealId) {
        return {
          ...meal,
          foods: meal.foods.map((food) =>
            food.id === editingFood.foodId ? updatedFood : food,
          ),
        };
      }
      return meal;
    });

    setMeals(updatedMeals);
    cancelEditing();
  };

  // Start replacing a food
  const startReplacingFood = (mealId: number, food: FoodItem) => {
    setReplacingFood({
      mealId,
      foodId: food.id,
      portionSize: food.portionSize,
      searchTerm: "",
      suggestions: [],
      showSuggestions: false,
    });
  };

  // Cancel replacing
  const cancelReplacing = () => {
    setReplacingFood({
      mealId: null,
      foodId: null,
      portionSize: 0,
      searchTerm: "",
      suggestions: [],
      showSuggestions: false,
    });
  };

  // Handle food search for replacement
  const handleReplacementSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchTerm = e.target.value;

    setReplacingFood((prev) => ({
      ...prev,
      searchTerm,
      showSuggestions: searchTerm.trim() !== "",
    }));

    if (searchTerm.trim() === "") {
      setReplacingFood((prev) => ({
        ...prev,
        suggestions: [],
        showSuggestions: false,
      }));
      return;
    }

    // Filter foods based on search term
    const filteredFoods = foodDatabase
      .filter((food) =>
        food.name.toLowerCase().includes(searchTerm.toLowerCase()),
      )
      .slice(0, 5); // Limit to 5 suggestions

    setReplacingFood((prev) => ({
      ...prev,
      suggestions: filteredFoods,
      showSuggestions: true,
    }));
  };

  // Replace a food with a new one
  const replaceFood = (newFood: Food) => {
    // Calculate the ratio based on the portion size
    const ratio = replacingFood.portionSize / 100;

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
    };

    // Update meals state by replacing the old food with the new one
    const updatedMeals = meals.map((meal) => {
      if (meal.id === replacingFood.mealId) {
        return {
          ...meal,
          foods: meal.foods.map((food) =>
            food.id === replacingFood.foodId ? replacementFood : food,
          ),
        };
      }
      return meal;
    });

    setMeals(updatedMeals);
    cancelReplacing();
  };

  // Generate a full day meal plan that hits the daily macro targets.
  // Per meal we pick a (protein, carb, fat) food triplet and solve a 3×3
  // linear system for portion sizes — see lib/meal-planner.ts.
  const generateMealPlan = async () => {
    setIsGeneratingMealPlan(true);
    setMealPlanMessage("Generating your personalized meal plan...");
    try {
      // Yield once so the spinner paints before the synchronous solve.
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Pull saved custom foods (silent if IndexedDB is unavailable).
      let customFoods: Food[] = [];
      try {
        const rows = await listCustomFoods();
        customFoods = rows.map(customToFood);
      } catch {
        // Fine — proceed with builtin only.
      }

      const daily = {
        protein: calculatedValues.protein,
        carbs: calculatedValues.carbs,
        fat: calculatedValues.fat,
        calories: calculatedValues.targetCalories,
      };
      const planned = planDay(meals, foodDatabase, daily, { customFoods });
      const summary = summarisePlan(planned, daily);

      setMeals(planned);

      const fmt = (n: number) => `${Math.round(n)}%`;
      const msg = summary.withinTolerance
        ? `Plan hits P:${fmt(summary.percent.protein)} C:${fmt(summary.percent.carbs)} F:${fmt(summary.percent.fat)} of target.`
        : `Plan within reach — P:${fmt(summary.percent.protein)} C:${fmt(summary.percent.carbs)} F:${fmt(summary.percent.fat)}. Limited by available foods.`;
      setMealPlanMessage(msg);
      setTimeout(() => setMealPlanMessage(""), 5000);
    } catch (error) {
      setMealPlanMessage("Error generating meal plan. Please try again.");
      console.error("Meal plan generation error:", error);
    } finally {
      setIsGeneratingMealPlan(false);
    }
  };

  return (
    <AppShell
      current={view}
      onSelect={setView}
    >
      {view === "calculator" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <PersonalInfoForm
              personalInfo={personalInfo}
              onPersonalInfoChange={handlePersonalInfoChange}
            />
          </div>
          <div className="lg:col-span-2">
            <MacroResults
              calculatedValues={calculatedValues}
              totalMacros={totalMacros}
            />
          </div>
        </div>
      )}

      {view === "plan" && (
        <MealPlanner
          calculatedValues={calculatedValues}
          totalMacros={totalMacros}
          meals={meals}
          selectedDate={selectedDate}
          today={today}
          onSelectDate={(d) => setExplicitDate(d === today ? null : d)}
          newFood={newFood}
          foodSearch={foodSearch}
          foodSuggestions={foodSuggestions}
          showSuggestions={showSuggestions}
          isSearchingRemote={search.isSearchingRemote}
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
          onSaveOffToCustom={handleSaveOffToCustom}
          onOpenCustomFoodForm={() => setCustomFoodOpen(true)}
          onSaveAsTemplate={(mealId) =>
            setTemplateDialog({ kind: "save", mealId })
          }
          onAddFromTemplate={(mealId) =>
            setTemplateDialog({ kind: "apply", mealId })
          }
        />
      )}

      <CustomFoodForm
        open={customFoodOpen}
        onOpenChange={setCustomFoodOpen}
        onSaved={handleCustomFoodSaved}
      />

      <SaveTemplateDialog
        open={templateDialog?.kind === "save"}
        onOpenChange={(o) => {
          if (!o) setTemplateDialog(null);
        }}
        foods={
          templateDialog?.kind === "save"
            ? (meals.find((m) => m.id === templateDialog.mealId)?.foods ?? [])
            : []
        }
        defaultName={
          templateDialog?.kind === "save"
            ? (meals.find((m) => m.id === templateDialog.mealId)?.name ??
              "Meal")
            : "Meal"
        }
        onSaved={() => setTemplateDialog(null)}
      />

      <ApplyTemplateDialog
        open={templateDialog?.kind === "apply"}
        onOpenChange={(o) => {
          if (!o) setTemplateDialog(null);
        }}
        targetMealName={
          templateDialog?.kind === "apply"
            ? (meals.find((m) => m.id === templateDialog.mealId)?.name ??
              "Meal")
            : "Meal"
        }
        onApply={handleApplyTemplate}
      />
    </AppShell>
  );
};

export default MacroCalculator;
