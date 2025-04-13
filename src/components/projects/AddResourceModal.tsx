
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Resource } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AddResourceModalProps {
  projectId: string;
  onResourceAdded: () => void;
  onClose: () => void;
}

const AddResourceModal: React.FC<AddResourceModalProps> = ({
  projectId,
  onResourceAdded,
  onClose,
}) => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [availableQuantity, setAvailableQuantity] = useState(0);

  const FormSchema = z.object({
    resourceId: z.string({
      required_error: "Please select a resource",
    }),
    quantity: z.coerce
      .number()
      .positive("Quantity must be positive")
      .max(availableQuantity, `Maximum available quantity is ${availableQuantity}`),
  });

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      resourceId: "",
      quantity: 1,
    },
  });

  // Fetch available resources
  useEffect(() => {
    const fetchResources = async () => {
      setLoading(true);
      try {
        // First, fetch all resources
        const { data: resourcesData, error: resourcesError } = await supabase
          .from('resources')
          .select('*')
          .order('name');
        
        if (resourcesError) throw resourcesError;

        // Then fetch all allocations
        const { data: allocationsData, error: allocationsError } = await supabase
          .from('resource_allocations')
          .select('*');
        
        if (allocationsError) throw allocationsError;

        // Calculate available quantity for each resource
        const resourcesWithAvailability = resourcesData.map(resource => {
          const allocations = allocationsData.filter(alloc => 
            alloc.resource_id === resource.id && !alloc.consumed
          );
          const allocatedQuantity = allocations.reduce(
            (sum, alloc) => sum + (alloc.quantity || 0), 
            0
          );
          
          // Determine status based on available quantity
          let status = resource.status;
          const availableQty = resource.quantity - allocatedQuantity;
          
          if (availableQty <= 0) {
            status = "Out of Stock";
          } else if (availableQty < resource.quantity * 0.2) { // Less than 20%
            status = "Low Stock";
          } else {
            status = "Available";
          }
          
          // Update resource with availability info
          return {
            ...resource,
            allocated: allocatedQuantity,
            available: availableQty,
            status
          } as Resource;
        });
        
        // Filter out resources that are out of stock
        const availableResources = resourcesWithAvailability.filter(
          resource => resource.available > 0
        );
        
        setResources(availableResources);
      } catch (error) {
        console.error("Error loading resources:", error);
        toast({
          title: "Error loading resources",
          description: "Could not load available resources",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchResources();
  }, [toast]);

  // Watch for resource selection and update available quantity
  const watchResourceId = form.watch("resourceId");
  
  useEffect(() => {
    if (watchResourceId) {
      const resource = resources.find(r => r.id === watchResourceId);
      if (resource) {
        setSelectedResource(resource);
        setAvailableQuantity(resource.available || resource.quantity);
        form.setValue("quantity", 1);
      }
    }
  }, [watchResourceId, resources, form]);

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      if (!selectedResource) {
        toast({
          title: "Selection error",
          description: "Please select a resource first",
          variant: "destructive",
        });
        return;
      }

      // Double check available quantity
      if (data.quantity > availableQuantity) {
        toast({
          title: "Quantity error",
          description: `Only ${availableQuantity} units available`,
          variant: "destructive",
        });
        return;
      }

      // Create resource allocation
      const { error } = await supabase.from("resource_allocations").insert({
        project_id: projectId,
        resource_id: data.resourceId,
        quantity: data.quantity,
        consumed: false,
      });

      if (error) throw error;

      toast({
        title: "Resource added",
        description: "Resource has been added to the project",
      });

      onResourceAdded();
    } catch (error) {
      console.error("Error adding resource:", error);
      toast({
        title: "Error",
        description: "Failed to add resource to project",
        variant: "destructive",
      });
    }
  };

  return (
    <Sheet open={true} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add Resource</SheetTitle>
          <SheetDescription>
            Add a resource to this project from available inventory
          </SheetDescription>
        </SheetHeader>

        <div className="py-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="resourceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resource</FormLabel>
                    <FormControl>
                      <Select
                        disabled={loading}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a resource" />
                        </SelectTrigger>
                        <SelectContent>
                          {resources.map((resource) => (
                            <SelectItem key={resource.id} value={resource.id}>
                              <div className="flex justify-between w-full">
                                <span>{resource.name}</span>
                                <span className="text-sm text-gray-500">
                                  ({resource.available || resource.quantity} {resource.unit} available)
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                          {resources.length === 0 && (
                            <div className="p-2 text-center text-sm text-gray-500">
                              {loading ? "Loading resources..." : "No resources available"}
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      Select a resource to add to this project
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedResource && (
                <div className="rounded-md bg-gray-50 p-4 mb-4">
                  <div className="text-sm">
                    <p><span className="font-medium">Type:</span> {selectedResource.type}</p>
                    <p><span className="font-medium">Category:</span> {selectedResource.returnable ? 'Returnable' : 'Consumable'}</p>
                    <p><span className="font-medium">Cost:</span> ${selectedResource.cost} per {selectedResource.unit}</p>
                    <p><span className="font-medium">Available:</span> {availableQuantity} {selectedResource.unit}</p>
                  </div>
                </div>
              )}

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={availableQuantity}
                        {...field}
                        disabled={!selectedResource}
                      />
                    </FormControl>
                    <FormDescription>
                      {selectedResource ? 
                        `Enter quantity (max: ${availableQuantity} ${selectedResource.unit})` : 
                        "Select a resource first"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={loading || !selectedResource || form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? "Adding..." : "Add Resource"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AddResourceModal;
